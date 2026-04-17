import { CompanionSatelliteClient, DeviceRegisterProps } from './client/client.js'
import { usb } from 'usb'
import * as HID from 'node-hid'
import { Complete, wrapAsync } from './lib.js'
import { ApiSurfaceInfo, ApiSurfacePluginInfo, ApiSurfacePluginsEnabled } from './apiTypes.js'
import { createLogger } from './logging.js'
import { HIDDevice, OpenDeviceResult } from '@companion-surface/host'
import { SurfaceDrawProps } from '@companion-surface/base'
import type { SurfaceSchemaLayoutDefinition } from '@companion-surface/base'
import {
	translateModuleToSatelliteSurfaceLayout,
	translateModuleToSatelliteTransferVariables,
	translateModuleToSatelliteConfigFields,
	calculateGridSize,
} from './translateSchema.js'
import { loadSurfacePlugins } from './surface-plugin-loader.js'
import { createHash } from 'node:crypto'
import { ImageTransformer, PixelFormat } from '@julusian/image-rs'
import { ChildHandler, type ChildHandlerDependencies } from './surface-thread/child-handler.js'
import { RespawnMonitor } from './lib/respawn.js'
import { getNodeJsPath, getSurfaceEntrypointPath, getChildNodePath } from './node-path.js'
import { type CheckDeviceInfo } from './surface-thread/ipc-types.js'

// Force into hidraw mode
HID.setDriverType('hidraw')
HID.devices()

export type SurfaceId = string

interface SurfaceInfo {
	readonly pluginId: string
	readonly productName: string
	readonly surfaceId: SurfaceId

	readonly registerProps: DeviceRegisterProps // TODO - explode?
	readonly surfaceLayout: SurfaceSchemaLayoutDefinition
}

export class SurfaceManager {
	readonly #logger = createLogger('SurfaceManager')

	readonly #surfaces: Map<SurfaceId, SurfaceInfo>
	/** Surfaces which are in the process of being opened */
	readonly #pendingSurfaces: Set<SurfaceId>
	/** Surfaces waiting for their initial DEVICE-CONFIG packet — suppresses that packet in the global deviceConfig handler */
	readonly #readyingSurfaces: Set<SurfaceId>
	readonly #client: CompanionSatelliteClient

	readonly #plugins = new Map<string, ChildHandler>()
	readonly #monitors = new Map<string, RespawnMonitor>()

	/**
	 * Stable ID registry — key: `${baseSurfaceId}||${pluginId}:${devicePath}` → resolvedSurfaceId.
	 * Persists across rescans so the same physical device always gets the same resolved ID.
	 */
	readonly #idRegistryCache = new Map<string, string>()
	/** Reverse map: resolvedSurfaceId → cacheKey (used for collision checking during ID assignment) */
	readonly #idRegistryReverse = new Map<string, string>()
	/** Stash of original (pre-resolve) surfaceId + uniqueness flag, keyed by resolvedSurfaceId */
	readonly #discoveredCheckBases = new Map<string, { surfaceId: string; surfaceIdIsNotUnique: boolean }>()

	#enabledPluginsConfig: ApiSurfacePluginsEnabled = {}

	#statusString: string
	#scanIsRunning = false
	#scanPending = false

	public static async create(
		client: CompanionSatelliteClient,
		enabledPluginsConfig: ApiSurfacePluginsEnabled,
		isPackaged: boolean,
	): Promise<SurfaceManager> {
		const manager = new SurfaceManager(client, enabledPluginsConfig)

		const nodeJsPath = await getNodeJsPath(isPackaged)
		if (!nodeJsPath) {
			manager.#logger.warn('No bundled Node.js binary found — surface plugins unavailable')
			return manager
		}

		const entrypointPath = getSurfaceEntrypointPath(isPackaged)
		const childNodePath = getChildNodePath(isPackaged)

		const rawPlugins = await loadSurfacePlugins()

		const deps: ChildHandlerDependencies = {
			resolveUniqueSurfaceId(baseSurfaceId, surfaceIdIsNotUnique, pluginId, devicePath) {
				const resolved = manager.#resolveUniqueSurfaceId(
					baseSurfaceId,
					surfaceIdIsNotUnique,
					pluginId,
					devicePath,
				)
				manager.#discoveredCheckBases.set(resolved, { surfaceId: baseSurfaceId, surfaceIdIsNotUnique })
				return resolved
			},
			forgetSurfaceId(pluginId, devicePath) {
				manager.#forgetSurfaceId(pluginId, devicePath)
			},
			notifyOpenedDiscoveredSurface(pluginId, info) {
				const handler = manager.#plugins.get(pluginId)
				if (!handler) {
					manager.#logger.warn(`notifyOpenedDiscoveredSurface: no handler for plugin "${pluginId}"`)
					return
				}
				const checkBase = manager.#discoveredCheckBases.get(info.surfaceId)
				const checkInfo: CheckDeviceInfo = {
					devicePath: '',
					surfaceId: checkBase?.surfaceId ?? info.surfaceId,
					surfaceIdIsNotUnique: checkBase?.surfaceIdIsNotUnique ?? false,
					description: info.description,
				}
				if (!manager.#tryAddSurfaceFromPlugin(handler, checkInfo, { type: 'detect', info })) {
					manager.#logger.warn(`Surface already exists: ${info.surfaceId}`)
				}
			},
			onSurfaceDisconnected(surfaceId) {
				manager.#logger.debug(`Plugin surface disconnected: ${surfaceId}`)
				manager.#cleanupSurfaceById(surfaceId)
			},
			onInputPress(surfaceId, controlId, pressed) {
				try {
					const surface = manager.#getWrappedSurface(surfaceId)
					const control = surface.registerProps.surfaceManifest.controls[controlId]
					if (!control) throw new Error(`Unknown control id: ${controlId}`)
					if (pressed) {
						manager.#client.keyDown(surfaceId, controlId, control)
					} else {
						manager.#client.keyUp(surfaceId, controlId, control)
					}
				} catch (e) {
					manager.#logger.error(`Input press for "${surfaceId}" failed: ${e}`)
				}
			},
			onInputRotate(surfaceId, controlId, delta) {
				try {
					const surface = manager.#getWrappedSurface(surfaceId)
					const control = surface.registerProps.surfaceManifest.controls[controlId]
					if (!control) throw new Error(`Unknown control id: ${controlId}`)
					if (delta < 0) {
						manager.#client.rotateLeft(surfaceId, controlId, control)
					} else if (delta > 0) {
						manager.#client.rotateRight(surfaceId, controlId, control)
					}
				} catch (e) {
					manager.#logger.error(`Input rotate for "${surfaceId}" failed: ${e}`)
				}
			},
			onChangePage(surfaceId, forward) {
				manager.#client.changePage(surfaceId, forward)
			},
			onPincodeEntry(surfaceId, keycode) {
				manager.#client.pincodeKey(surfaceId, keycode)
			},
			onSetVariableValue(surfaceId, name, value) {
				manager.#client.sendVariableValue(surfaceId, name, value as string)
			},
			onFirmwareUpdateInfo(surfaceId, updateUrl) {
				manager.#client.sendFirmwareUpdateInfo(surfaceId, updateUrl ?? '')
			},
		}

		const startupPromises: Array<Promise<void>> = []

		try {
			for (const rawPlugin of rawPlugins) {
				try {
					const pluginId = rawPlugin.info.pluginId

					const monitor = new RespawnMonitor([nodeJsPath, entrypointPath], {
						stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
						env: {
							...process.env,
							MODULE_ENTRYPOINT: rawPlugin.entrypointPath,
							MODULE_MANIFEST: rawPlugin.manifestPath,
							NODE_PATH: childNodePath,
						},
					})

					const {
						promise: registered,
						resolve: resolveRegister,
						reject: rejectRegister,
					} = Promise.withResolvers<void>()

					const handler = new ChildHandler(rawPlugin.info, rawPlugin.usbIds, monitor, deps, async (token) => {
						if (token !== handler.getVerificationToken()) {
							const err = new Error(`Plugin "${pluginId}" sent invalid verification token`)
							manager.#logger.error(err.message)
							rejectRegister(err)
							throw err
						}
						resolveRegister()
					})

					// Inject the verification token into the child's environment now that the
					// handler (and its token) have been constructed.
					monitor.env = { ...monitor.env, VERIFICATION_TOKEN: handler.getVerificationToken() }

					manager.#plugins.set(pluginId, handler)
					manager.#monitors.set(pluginId, monitor)

					monitor.on('stdout', (data: Buffer) =>
						manager.#logger.debug(`[${pluginId}] stdout: ${data.toString().trim()}`),
					)
					monitor.on('stderr', (data: Buffer) =>
						manager.#logger.warn(`[${pluginId}] stderr: ${data.toString().trim()}`),
					)
					monitor.on('crash', () => manager.#logger.error(`[${pluginId}] process crashed`))
					monitor.start()

					const startupPromise = registered
						.then(async () => {
							if (manager.isPluginEnabled(pluginId)) {
								await handler.init()
							}
						})
						.catch((e) => {
							manager.#logger.error(`Plugin "${pluginId}" startup failed: ${e}`)
						})
					startupPromises.push(startupPromise)
				} catch (e) {
					manager.#logger.error(`Failed to create handler for plugin "${rawPlugin.info.pluginId}": ${e}`)
				}
			}

			// Wait for all plugins to start up before triggering the initial scan
			await Promise.allSettled(startupPromises)

			// Initial scan for surfaces after plugins are loaded
			manager.scanForSurfaces()
		} catch (e) {
			// Something failed, cleanup
			await Promise.allSettled(
				Array.from(manager.#monitors.values()).map(
					async (monitor) => new Promise<void>((res) => monitor.stop(res)),
				),
			)
			throw e
		}

		return manager
	}

	private constructor(client: CompanionSatelliteClient, enabledPluginsConfig: ApiSurfacePluginsEnabled) {
		this.#client = client
		this.#enabledPluginsConfig = enabledPluginsConfig
		this.#surfaces = new Map()
		this.#pendingSurfaces = new Set()
		this.#readyingSurfaces = new Set()

		usb.on('attach', this.#onUsbAttach)
		usb.on('detach', this.#onUsbDetach)
		// Don't block process exit with the watching
		usb.unrefHotplugEvents()

		this.#statusString = 'Connecting'
		this.#showStatusCard(this.#statusString, true)

		client.on('connected', () => {
			this.#logger.info('connected')

			this.#showStatusCard('Connected', false)

			this.syncCapabilitiesAndRegisterAllDevices()
		})
		client.on('disconnected', () => {
			this.#logger.info('disconnected')

			this.#showStatusCard('Connecting', true)
		})
		client.on('connecting', () => {
			this.#showStatusCard('Connecting', true)
		})

		client.on(
			'brightness',
			wrapAsync(
				async (msg) => {
					const plugin = this.#getPluginForSurface(msg.deviceId)

					await plugin.setBrightness(msg.deviceId, msg.percent)
				},
				(e) => {
					this.#logger.error(`Set brightness: ${e}`)
				},
			),
		)
		client.on(
			'clearDeck',
			wrapAsync(
				async (msg) => {
					const plugin = this.#getPluginForSurface(msg.deviceId)

					await plugin.blankSurface(msg.deviceId)
				},
				(e) => {
					this.#logger.error(`Clear deck: ${e}`)
				},
			),
		)
		client.on(
			'draw',
			wrapAsync(
				async (msg) => {
					const surface = this.#getWrappedSurface(msg.deviceId)
					const plugin = this.#getPluginForSurface(msg.deviceId)

					let controlId = msg.controlId
					if (!controlId) {
						if (typeof msg.keyIndex !== 'number')
							throw new Error('No controlId or keyIndex provided for draw command')

						const row = Math.floor(msg.keyIndex / surface.registerProps.gridSize.columns)
						const column = msg.keyIndex % surface.registerProps.gridSize.columns

						const controlInfo = Object.entries(surface.registerProps.surfaceManifest.controls).find(
							([_id, control]) => {
								return control.row === row && control.column === column
							},
						)
						// Ignore a bad index. This can happen if there are gaps in the layout
						if (!controlInfo) return
						controlId = controlInfo[0]
					}

					const control = surface.registerProps.surfaceManifest.controls[controlId]
					const presetName = control?.stylePreset ?? 'default'
					const preset =
						surface.surfaceLayout.stylePresets[presetName] ?? surface.surfaceLayout.stylePresets['default']
					const bitmap = preset?.bitmap

					let image: Uint8Array | undefined
					if (msg.image && bitmap) {
						const format: PixelFormat = bitmap.format ?? 'rgb'
						if (format === 'rgb') {
							image = msg.image
						} else {
							const computed = await ImageTransformer.fromBuffer(
								msg.image,
								bitmap.w,
								bitmap.h,
								'rgb',
							).toBuffer(format)
							image = computed.buffer
						}
					}

					// Parse the page-number from the location
					let pageNumber: number | undefined = undefined
					if (typeof msg.location === 'string') {
						const locationParts = msg.location.split('/')
						if (locationParts.length === 3) {
							pageNumber = Number(locationParts[0])
							if (isNaN(pageNumber)) {
								this.#logger.warn(`Received invalid page number: ${locationParts[0]}`)
								pageNumber = undefined
							}
						} else {
							this.#logger.warn(`Received invalid location format: ${msg.location}`)
						}
					}

					await plugin.draw(msg.deviceId, [
						{
							pageNumber,
							controlId: controlId,
							image: image,
							color: msg.color,
							text: msg.text,
						} satisfies Complete<SurfaceDrawProps>,
					])
				},
				(e) => {
					this.#logger.error(`Draw: ${e}`)
				},
			),
		)
		client.on(
			'variableValue',
			wrapAsync(
				async (msg) => {
					const plugin = this.#getPluginForSurface(msg.deviceId)

					await plugin.onVariableValue(msg.deviceId, msg.name, msg.value)
				},
				(e) => {
					this.#logger.error(`Error handling variable value: ${e}`)
				},
			),
		)
		client.on(
			'lockedState',
			wrapAsync(
				async (msg) => {
					const plugin = this.#getPluginForSurface(msg.deviceId)

					await plugin.showLockedStatus(msg.deviceId, msg.locked, msg.characterCount)
				},
				(e) => {
					this.#logger.error(`Clear deck: ${e}`)
				},
			),
		)
		client.on(
			'newDevice',
			wrapAsync(
				async (msg) => {
					const plugin = this.#getPluginForSurface(msg.deviceId)

					let config: Record<string, unknown> = {}
					const surface = this.#getWrappedSurface(msg.deviceId)

					if (this.#client.supportsDeviceSerial && surface.registerProps.configFields?.length) {
						this.#readyingSurfaces.add(msg.deviceId)
						// Companion (v1.10+) sends DEVICE-CONFIG immediately after acknowledging ADD-DEVICE
						// if there is stored config. Only wait if this surface has config fields — otherwise
						// DEVICE-CONFIG is never sent and we'd needlessly delay readySurface.
						config = await new Promise<Record<string, unknown>>((resolve) => {
							const timer = setTimeout(() => {
								client.off('deviceConfig', onConfig)
								resolve({})
							}, 100)
							const onConfig = (cfgMsg: { deviceId: string; config: Record<string, unknown> }) => {
								if (cfgMsg.deviceId !== msg.deviceId) return
								clearTimeout(timer)
								client.off('deviceConfig', onConfig)
								resolve(cfgMsg.config)
							}
							client.on('deviceConfig', onConfig)
						}).finally(() => {
							this.#readyingSurfaces.delete(msg.deviceId)
						})
					}

					await plugin.readySurface(msg.deviceId, config)
				},
				(e) => {
					this.#logger.error(`Setup device: ${e}`)
				},
			),
		)
		client.on(
			'deviceConfig',
			wrapAsync(
				async (msg) => {
					// Suppress the initial packet already consumed by the newDevice handler
					if (this.#readyingSurfaces.has(msg.deviceId)) return

					const plugin = this.#getPluginForSurface(msg.deviceId)

					await plugin.updateConfig(msg.deviceId, msg.config)
				},
				(e) => {
					this.#logger.error(`Device config update: ${e}`)
				},
			),
		)
		client.on(
			'deviceErrored',
			wrapAsync(
				async (msg) => {
					const plugin = this.#getPluginForSurface(msg.deviceId)

					await plugin.showStatus(msg.deviceId, this.#client.displayHost, msg.message)

					// Try again to add the device, in case we can recover
					this.#delayRetryAddOfDevice(msg.deviceId)
				},
				(e) => {
					this.#logger.error(`Failed device: ${e}`)
				},
			),
		)
	}

	#delayRetryAddOfDevice(surfaceId: string) {
		setTimeout(() => {
			try {
				const surface = this.#surfaces.get(surfaceId)
				if (!surface) return

				// Don't retry if the client already has the device
				if (this.#client.hasDevice(surfaceId)) return

				this.#logger.debug(`retry add: ${surfaceId}`)

				this.#client.addDevice(surfaceId, surface.productName, surface.registerProps)
			} catch (e) {
				this.#logger.error(`Retry add failed: ${e}`)
			}
		}, 1000)
	}

	public async close(): Promise<void> {
		usb.off('attach', this.#onUsbAttach)
		usb.off('detach', this.#onUsbDetach)

		for (const handler of this.#plugins.values()) {
			handler.destroy()
		}

		await Promise.allSettled(
			Array.from(this.#monitors.values()).map(async (monitor) => new Promise<void>((res) => monitor.stop(res))),
		)
	}

	#getWrappedSurface(surfaceId: string): SurfaceInfo {
		const surface = this.#surfaces.get(surfaceId)
		if (!surface) throw new Error(`Missing device for serial: "${surfaceId}"`)
		return surface
	}
	#getPluginForSurface(surfaceId: string): ChildHandler {
		const surface = this.#getWrappedSurface(surfaceId)
		const plugin = this.#plugins.get(surface.pluginId)
		if (!plugin) throw new Error(`Missing plugin for surface: "${surfaceId}"`)
		return plugin
	}

	#onUsbAttach = (dev: usb.Device): void => {
		this.#logger.debug(`Found a usb device: ${JSON.stringify(dev.deviceDescriptor)}`)

		// most of the time it is available now
		this.scanForSurfaces()
		// sometimes it ends up delayed
		setTimeout(() => this.scanForSurfaces(), 1000)
	}

	#onUsbDetach = (_dev: usb.Device): void => {
		// Rescan after a short timeout
		setTimeout(() => this.scanForSurfaces(), 1000)
	}

	#cleanupSurfaceById(surfaceId: string): void {
		const surface = this.#surfaces.get(surfaceId)
		if (!surface) return

		try {
			// cleanup
			this.#surfaces.delete(surfaceId)
			this.#client.removeDevice(surfaceId)
		} catch (_e) {
			// Ignore
		}
	}

	public syncCapabilitiesAndRegisterAllDevices(): void {
		this.#logger.debug(`registerAll ${Array.from(this.#surfaces.keys()).join(',')}`)
		for (const surface of this.#surfaces.values()) {
			try {
				// If it is still in the process of initialising skip it
				if (this.#pendingSurfaces.has(surface.surfaceId)) continue

				const plugin = this.#plugins.get(surface.pluginId)
				if (!plugin) throw new Error(`Missing plugin for surface: "${surface.surfaceId}"`)

				plugin.showStatus(surface.surfaceId, this.#client.displayHost, this.#statusString).catch((e) => {
					this.#logger.error(`Show status failed for "${surface.surfaceId}": ${e}`)
				})

				// Re-init device
				this.#client.addDevice(surface.surfaceId, surface.productName, surface.registerProps)
			} catch (e) {
				this.#logger.error(`Register failed for "${surface.surfaceId}": ${e}`)
			}
		}

		this.scanForSurfaces()
	}

	/**
	 * Scan for and open any surfaces
	 */
	public scanForSurfaces(): void {
		if (this.#scanIsRunning) {
			this.#scanPending = true
			return
		}

		this.#scanIsRunning = true
		this.#scanPending = false

		void Promise.allSettled([
			HID.devicesAsync()
				.then(async (devices) => {
					await Promise.allSettled(
						Array.from(this.#plugins.entries()).map(async ([pluginId, plugin]) => {
							try {
								if (!this.isPluginEnabled(pluginId)) return

								const relevant = devices.filter(
									(d) => d.path && plugin.isRelevantHidDevice(d.vendorId, d.productId),
								)
								if (relevant.length === 0) return

								const hidDevices: HIDDevice[] = relevant.map(
									(device) =>
										({
											vendorId: device.vendorId,
											productId: device.productId,
											path: device.path!,
											serialNumber:
												device.serialNumber ||
												createHash('sha1')
													.update(`${device.vendorId}:${device.productId}`)
													.digest('hex')
													.slice(0, 20),
											manufacturer: device.manufacturer,
											product: device.product,
											release: device.release,
											interface: device.interface,
											usagePage: device.usagePage,
											usage: device.usage,
										}) satisfies Complete<HIDDevice>,
								)

								const results = await plugin.checkHidDevices(hidDevices)
								for (const info of results) {
									const hid = hidDevices.find((d) => d.path === info.devicePath)
									if (!hid) {
										this.#logger.warn(
											`Plugin "${pluginId}" returned unknown devicePath: ${info.devicePath}`,
										)
										continue
									}
									this.#tryAddSurfaceFromPlugin(plugin, info, { type: 'hid', hid })
								}
							} catch (e) {
								this.#logger.error(`Plugin "${pluginId}" HID check failed: ${e}`)
							}
						}),
					)
				})
				.catch((e) => {
					this.#logger.error(`HID scan failed: ${e}`)
				}),

			...Array.from(this.#plugins.entries()).map(async ([pluginId, plugin]) => {
				try {
					if (!this.isPluginEnabled(pluginId)) return

					const surfaceInfos = await plugin.scanForDevices()
					for (const surfaceInfo of surfaceInfos) {
						this.#tryAddSurfaceFromPlugin(plugin, surfaceInfo, { type: 'scan' })
					}
				} catch (e) {
					this.#logger.error(`Plugin "${pluginId}" scan failed: ${e}`)
				}
			}),
		]).finally(() => {
			this.#scanIsRunning = false

			if (this.#scanPending) {
				this.scanForSurfaces()
			}
		})
	}

	/**
	 * List all of the currently open surfaces
	 */
	public getOpenSurfacesInfo(): ApiSurfaceInfo[] {
		return Array.from(this.#surfaces.values())
			.map((surface) => ({
				pluginId: surface.pluginId,
				pluginName: this.#plugins.get(surface.pluginId)?.info?.pluginName ?? 'Unknown',
				surfaceId: surface.surfaceId,
				productName: surface.productName,
			}))
			.sort((a, b) => a.surfaceId.localeCompare(b.surfaceId))
	}

	/**
	 * List all of the available/installed plugins
	 */
	public getAvailablePluginsInfo(): ApiSurfacePluginInfo[] {
		return Array.from(this.#plugins.values())
			.map((plugin) => plugin.info)
			.sort((a, b) => a.pluginName.localeCompare(b.pluginName))
	}

	private isPluginEnabled(pluginId: string): boolean {
		return this.#enabledPluginsConfig[pluginId] ?? false
	}

	public updatePluginsEnabled(enabledPlugins: ApiSurfacePluginsEnabled): void {
		const oldEnabledPlugins = this.#enabledPluginsConfig
		this.#enabledPluginsConfig = enabledPlugins

		// call init/destroy as needed
		for (const [pluginId, plugin] of this.#plugins.entries()) {
			const wasEnabled = oldEnabledPlugins[pluginId] ?? false
			const isEnabled = this.isPluginEnabled(pluginId)
			if (wasEnabled === isEnabled) continue

			if (isEnabled) {
				plugin.init().catch((e) => {
					this.#logger.error(`Plugin "${pluginId}" init failed: ${e}`)
				})
			} else {
				plugin.destroy()
			}
		}

		// Disable any surfaces whose plugin has been disabled
		for (const [surfaceId, surface] of this.#surfaces.entries()) {
			if (this.isPluginEnabled(surface.pluginId)) continue

			this.#cleanupSurfaceById(surfaceId)
		}

		// Trigger a scan, to pick up anything just enabled
		this.scanForSurfaces()
	}

	#tryAddSurfaceFromPlugin(
		plugin: ChildHandler,
		pluginInfo: CheckDeviceInfo,
		openInfo:
			| {
					type: 'scan'
			  }
			| {
					type: 'hid'
					hid: HIDDevice
			  }
			| {
					type: 'detect'
					info: OpenDeviceResult
			  },
	): boolean {
		// For the 'detect' path, PluginWrapper already called shouldOpenDiscoveredSurface
		// and the OpenDeviceResult.surfaceId is already the resolvedSurfaceId.
		// For 'hid'/'scan' paths, we resolve the ID ourselves using the stable cache.
		const devicePath = openInfo.type === 'hid' ? openInfo.hid.path : pluginInfo.devicePath
		const resolvedSurfaceId =
			openInfo.type === 'detect'
				? openInfo.info.surfaceId
				: this.#resolveUniqueSurfaceId(
						pluginInfo.surfaceId,
						pluginInfo.surfaceIdIsNotUnique,
						plugin.info.pluginId,
						devicePath,
					)

		if (this.#pendingSurfaces.has(resolvedSurfaceId) || this.#surfaces.has(resolvedSurfaceId)) return false
		this.#pendingSurfaces.add(resolvedSurfaceId)

		// Determine the serial number and uniqueness from either stashed info (detect) or the pluginInfo directly
		const serialNumber = pluginInfo.surfaceId
		const serialIsUnique = !pluginInfo.surfaceIdIsNotUnique

		this.#logger.debug(
			`adding new surface: ${resolvedSurfaceId} (serial=${serialNumber}, unique=${serialIsUnique})`,
		)
		this.#logger.debug(`existing = ${JSON.stringify(Array.from(this.#surfaces.keys()))}`)

		const pOpen =
			openInfo.type === 'hid'
				? plugin.openHidDevice(openInfo.hid, resolvedSurfaceId)
				: openInfo.type === 'scan'
					? plugin.openScannedDevice(pluginInfo, resolvedSurfaceId)
					: Promise.resolve(openInfo.info)

		pOpen
			.then(async (result) => {
				if (!result) return

				// Ensure the plugin is still enabled and the same instance
				if (!this.isPluginEnabled(plugin.info.pluginId) || this.#plugins.get(plugin.info.pluginId) !== plugin) {
					return
				}

				let bitmapSize = result.surfaceLayout.stylePresets.default.bitmap
				if (!bitmapSize) {
					bitmapSize = Object.values(result.surfaceLayout.stylePresets).find((s) => !!s.bitmap)?.bitmap
				}

				const openedInfo: SurfaceInfo = {
					pluginId: plugin.info.pluginId,
					surfaceId: resolvedSurfaceId,
					productName: pluginInfo.description,
					surfaceLayout: result.surfaceLayout,
					registerProps: {
						serialNumber,
						serialIsUnique,

						brightness: result.supportsBrightness,
						surfaceManifest: translateModuleToSatelliteSurfaceLayout(result.surfaceLayout),
						transferVariables: translateModuleToSatelliteTransferVariables(result.transferVariables),
						configFields: translateModuleToSatelliteConfigFields(result.configFields),
						canChangePage: result.canChangePage,

						gridSize: calculateGridSize(result.surfaceLayout),
						fallbackBitmapSize: bitmapSize ? Math.min(bitmapSize.h, bitmapSize.w) : 0,
					},
				}

				this.#surfaces.set(resolvedSurfaceId, openedInfo)

				this.#client.addDevice(resolvedSurfaceId, openedInfo.productName, openedInfo.registerProps)
			})
			.catch((e) => {
				this.#logger.error(`Open "${resolvedSurfaceId}" failed: ${e}`)
			})
			.finally(() => {
				this.#pendingSurfaces.delete(resolvedSurfaceId)
				// Clean up stashed discovery info
				this.#discoveredCheckBases.delete(resolvedSurfaceId)
			})

		return true
	}

	/**
	 * Return a stable collision-resolved surface ID for a device.
	 *
	 * The cache key is `{baseSurfaceId}||{pluginId}:{devicePath}`. If the same
	 * (surfaceId, pluginId, devicePath) tuple has been seen before, the same
	 * resolved ID is returned — regardless of whether the device is currently open.
	 * This prevents re-scans from generating new IDs for already-open devices.
	 *
	 * Collisions (two different devices sharing the same base surfaceId) are broken
	 * by appending `-dev2`, `-dev3`, … matching Companion's suffix convention.
	 */
	#resolveUniqueSurfaceId(
		baseSurfaceId: string,
		surfaceIdIsNotUnique: boolean,
		pluginId: string,
		devicePath: string,
	): string {
		const cacheKey = `${baseSurfaceId}||${pluginId}:${devicePath}`

		const cached = this.#idRegistryCache.get(cacheKey)
		if (cached !== undefined) return cached

		for (let i = 1; ; i++) {
			const resolvedId = i > 1 || surfaceIdIsNotUnique ? `${baseSurfaceId}-dev${i}` : baseSurfaceId
			if (!this.#idRegistryReverse.has(resolvedId)) {
				this.#idRegistryCache.set(cacheKey, resolvedId)
				this.#idRegistryReverse.set(resolvedId, cacheKey)
				return resolvedId
			}
		}
	}

	/**
	 * Remove the ID registry entry for a device that is no longer present.
	 * Called from the per-plugin forgetDiscoveredSurfaces handler.
	 */
	#forgetSurfaceId(pluginId: string, devicePath: string): void {
		const pathSuffix = `||${pluginId}:${devicePath}`
		for (const [key, resolvedId] of this.#idRegistryCache.entries()) {
			if (key.endsWith(pathSuffix)) {
				this.#idRegistryCache.delete(key)
				this.#idRegistryReverse.delete(resolvedId)
				break
			}
		}
	}

	#statusCardTimer: NodeJS.Timeout | undefined
	#showStatusCard(message: string, runLoop: boolean): void {
		this.#statusString = message

		if (this.#statusCardTimer) {
			clearInterval(this.#statusCardTimer)
			this.#statusCardTimer = undefined
		}

		if (runLoop) {
			let dots = ''
			this.#statusCardTimer = setInterval(() => {
				dots += ' .'
				if (dots.length > 7) dots = ''

				this.#doDrawStatusCard(message + dots)
			}, 1000)
		}

		this.#doDrawStatusCard(message)
	}

	#doDrawStatusCard(message: string) {
		for (const dev of this.#surfaces.values()) {
			const plugin = this.#plugins.get(dev.pluginId)
			if (!plugin) continue

			plugin.showStatus(dev.surfaceId, this.#client.displayHost, message).catch((e) => {
				this.#logger.error(`Show status failed for "${dev.surfaceId}": ${e}`)
			})
		}
	}
}
