import { CompanionSatelliteClient, DeviceRegisterProps } from './client/client.js'
import { usb } from 'usb'
import { CardGenerator } from './graphics/cards.js'
import * as HID from 'node-hid'
import { Complete, wrapAsync } from './lib.js'
import { ApiSurfaceInfo, ApiSurfacePluginInfo, ApiSurfacePluginsEnabled } from './apiTypes.js'
import { createLogger } from './logging.js'
import {
	CheckDeviceResult,
	OpenDeviceResult,
	PluginWrapper,
	ShouldOpenSurfaceResult,
	SurfaceHostContext,
} from '@companion-surface/host'
import { HIDDevice, SurfaceDrawProps } from '@companion-surface/base'
import type { SurfaceSchemaLayoutDefinition } from '@companion-surface/base'
import { LockingGraphicsGeneratorImpl } from './graphics/locking.js'
import {
	translateModuleToSatelliteSurfaceLayout,
	translateModuleToSatelliteTransferVariables,
	translateModuleToSatelliteConfigFields,
	calculateGridSize,
} from './translateSchema.js'
import { loadSurfacePlugins, type LoadedPlugin } from './surface-plugin-loader.js'
import { createHash } from 'node:crypto'
import { ImageTransformer, PixelFormat } from '@julusian/image-rs'

// Force into hidraw mode
HID.setDriverType('hidraw')
HID.devices()

export type SurfaceId = string

class PluginWrapperExt extends PluginWrapper<unknown> {
	readonly info: ApiSurfacePluginInfo
	constructor(host: SurfaceHostContext, plugin: LoadedPlugin) {
		super(host, plugin.plugin)

		this.info = plugin.info
	}
}

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

	readonly #plugins = new Map<string, PluginWrapperExt>()

	/**
	 * Stable ID registry — key: `${baseSurfaceId}||${pluginId}:${devicePath}` → resolvedSurfaceId.
	 * Persists across rescans so the same physical device always gets the same resolved ID.
	 */
	readonly #idRegistryCache = new Map<string, string>()
	/** Reverse map: resolvedSurfaceId → cacheKey (used for collision checking during ID assignment) */
	readonly #idRegistryReverse = new Map<string, string>()
	/** Stashed CheckDeviceResult info from shouldOpenDiscoveredSurface, keyed by resolvedSurfaceId */
	readonly #discoveredInfo = new Map<string, CheckDeviceResult>()

	#enabledPluginsConfig: ApiSurfacePluginsEnabled = {}

	#statusString: string
	#scanIsRunning = false
	#scanPending = false

	public static async create(
		client: CompanionSatelliteClient,
		enabledPluginsConfig: ApiSurfacePluginsEnabled,
	): Promise<SurfaceManager> {
		const manager = new SurfaceManager(client, enabledPluginsConfig)

		const hostContext = manager.createHostContext()

		const rawPlugins = await loadSurfacePlugins()

		try {
			for (const rawPlugin of rawPlugins) {
				try {
					const pluginId = rawPlugin.info.pluginId
					// pluginRef is set immediately after construction; PluginWrapper never calls
					// notifyOpenedDiscoveredSurface synchronously, so this is always set in time.
					let pluginRef: PluginWrapperExt | null = null

					const hostContextFull: SurfaceHostContext = {
						...hostContext,
						shouldOpenDiscoveredSurface: async (
							info: CheckDeviceResult,
						): Promise<ShouldOpenSurfaceResult> => {
							const resolvedSurfaceId = manager.#resolveUniqueSurfaceId(
								info.surfaceId,
								info.surfaceIdIsNotUnique,
								pluginId,
								info.devicePath,
							)
							manager.#discoveredInfo.set(resolvedSurfaceId, info)
							return { shouldOpen: true, resolvedSurfaceId }
						},
						forgetDiscoveredSurfaces: (devicePaths: string[]) => {
							for (const devicePath of devicePaths) {
								manager.#forgetSurfaceId(pluginId, devicePath)
							}
						},
						notifyOpenedDiscoveredSurface: async (info: OpenDeviceResult) => {
							if (!pluginRef) throw new Error('Plugin not initialized')
							const discoveredInfo = manager.#discoveredInfo.get(info.surfaceId)
							if (!discoveredInfo) {
								manager.#logger.warn(
									`No discovered info for surface: ${info.surfaceId}, using defaults`,
								)
							}
							const checkResult: CheckDeviceResult = discoveredInfo ?? {
								devicePath: '',
								surfaceId: info.surfaceId,
								surfaceIdIsNotUnique: false,
								description: info.description,
							}
							if (!manager.#tryAddSurfaceFromPlugin(pluginRef, checkResult, { type: 'detect', info })) {
								manager.#logger.warn(`Surface already exists: ${info.surfaceId}`)
							}
						},
					}
					pluginRef = new PluginWrapperExt(hostContextFull, rawPlugin)

					manager.#plugins.set(pluginId, pluginRef)
				} catch (e) {
					manager.#logger.error(`Failed to load plugin "${rawPlugin.info.pluginId}": ${e}`)
				}
			}

			// Initialize all the plugins
			await Promise.allSettled(
				Array.from(manager.#plugins.entries()).map(async ([pluginId, plugin]) => {
					if (!manager.isPluginEnabled(pluginId)) return
					await plugin.init().catch((e) => {
						manager.#logger.error(`Plugin "${pluginId}" init failed: ${e}`)
					})
				}),
			)

			// Initial scan for surfaces after plugins are loaded
			manager.scanForSurfaces()
		} catch (e) {
			// Something failed, cleanup
			await Promise.allSettled(Array.from(manager.#plugins.values()).map(async (p) => p.destroy()))
			throw e
		}

		return manager
	}

	private createHostContext(): Omit<
		SurfaceHostContext,
		'notifyOpenedDiscoveredSurface' | 'shouldOpenDiscoveredSurface' | 'forgetDiscoveredSurfaces'
	> {
		const runForSurface = (surfaceId: string, fn: (surface: SurfaceInfo) => void) => {
			try {
				const surface = this.#getWrappedSurface(surfaceId)

				fn(surface)
			} catch (e) {
				this.#logger.error(`Surface event for "${surfaceId}" failed: ${e}`)
			}
		}

		return {
			lockingGraphics: new LockingGraphicsGeneratorImpl(),
			cardsGenerator: new CardGenerator(),

			capabilities: {
				// Nothing yet
			},

			surfaceEvents: {
				disconnected: (surfaceId: string) => {
					this.#logger.debug(`Plugin surface disconnected: ${surfaceId}`)

					this.#cleanupSurfaceById(surfaceId)
				},
				inputPress: (surfaceId: string, controlId: string, pressed: boolean) => {
					runForSurface(surfaceId, (surface) => {
						const control = surface.registerProps.surfaceManifest.controls[controlId]
						if (!control) throw new Error(`Unknown control id: ${controlId}`)

						if (pressed) {
							this.#client.keyDown(surfaceId, controlId, control)
						} else {
							this.#client.keyUp(surfaceId, controlId, control)
						}
					})
				},
				inputRotate: (surfaceId: string, controlId: string, delta: number) => {
					runForSurface(surfaceId, (surface) => {
						const control = surface.registerProps.surfaceManifest.controls[controlId]
						if (!control) throw new Error(`Unknown control id: ${controlId}`)

						if (delta < 0) {
							this.#client.rotateLeft(surfaceId, controlId, control)
						} else if (delta > 0) {
							this.#client.rotateRight(surfaceId, controlId, control)
						}
					})
				},
				setVariableValue: (surfaceId: string, name: string, value: any) => {
					this.#client.sendVariableValue(surfaceId, name, value)
				},
				pincodeEntry: (surfaceId: string, char: number) => {
					this.#client.pincodeKey(surfaceId, char)
				},
				changePage: (surfaceId: string, forward: boolean) => {
					this.#client.changePage(surfaceId, forward)
				},
				firmwareUpdateInfo: (surfaceId: string, info) => {
					if (info?.updateUrl) {
						this.#client.sendFirmwareUpdateInfo(surfaceId, info.updateUrl)
					} else {
						this.#client.sendFirmwareUpdateInfo(surfaceId, '')
					}
				},
			},

			connectionsFound: (_connectionInfos) => {
				// Not used by satellite
			},

			connectionsForgotten: (_connectionIds) => {
				// Not used by satellite
			},
		}
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

		// Cleanup all the plugins
		await Promise.allSettled(
			Array.from(this.#plugins.values()).map(async (plugin) => {
				await plugin.destroy()
			}),
		)
	}

	#getWrappedSurface(surfaceId: string): SurfaceInfo {
		const surface = this.#surfaces.get(surfaceId)
		if (!surface) throw new Error(`Missing device for serial: "${surfaceId}"`)
		return surface
	}
	#getPluginForSurface(surfaceId: string): PluginWrapperExt {
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
						devices.map(async (device) => {
							if (!device.path) return

							const hidDevice: HIDDevice = {
								vendorId: device.vendorId,
								productId: device.productId,
								path: device.path,
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
							} satisfies Complete<HIDDevice>

							for (const [pluginId, plugin] of this.#plugins.entries()) {
								try {
									if (!this.isPluginEnabled(pluginId)) continue

									const info = await plugin.checkHidDevice(hidDevice)
									if (!info) continue

									this.#tryAddSurfaceFromPlugin(plugin, info, {
										type: 'hid',
										hid: hidDevice,
									})
									return
								} catch (e) {
									this.#logger.error(`Plugin "${pluginId}" HID check failed: ${e}`)
								}
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
				plugin.destroy().catch((e) => {
					this.#logger.error(`Plugin "${pluginId}" destroy failed: ${e}`)
				})
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
		plugin: PluginWrapperExt,
		pluginInfo: CheckDeviceResult,
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
				this.#discoveredInfo.delete(resolvedSurfaceId)
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
