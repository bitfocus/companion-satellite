import { CompanionSatelliteClient } from './client.js'
import { usb } from 'usb'
import { CardGenerator } from './graphics/cards.js'
import { DeviceRegisterPropsComplete, SurfaceId } from './device-types/api.js'
import * as HID from 'node-hid'
import { wrapAsync } from './lib.js'
import { ApiSurfaceInfo, ApiSurfacePluginInfo, ApiSurfacePluginsEnabled } from './apiTypes.js'
import { createLogger } from './logging.js'
import {
	CheckDeviceResult,
	OpenDeviceResult,
	PluginWrapper,
	ShouldOpenSurfaceResult,
	SurfaceHostContext,
} from '@companion-surface/host'
import { HIDDevice, SurfacePlugin as SurfacePlugin2 } from '@companion-surface/base'
import { LockingGraphicsGeneratorImpl } from './graphics/locking.js'
import { calculateGridSize } from './device-types/lib.js'
import {
	translateModuleToSatelliteSurfaceLayout,
	translateModuleToSatelliteTransferVariables,
} from './translateSchema.js'
import type { LoadedPlugin } from './module-store/index.js'

// Force into hidraw mode
HID.setDriverType('hidraw')
HID.devices()

interface RawPluginsInfo {
	info: ApiSurfacePluginInfo
	plugin: SurfacePlugin2<unknown>
}

class PluginWrapper2 extends PluginWrapper<unknown> {
	readonly info: ApiSurfacePluginInfo
	constructor(host: SurfaceHostContext, plugin: RawPluginsInfo) {
		super(host, plugin.plugin)

		this.info = plugin.info
	}
}

interface SurfaceInfo {
	readonly pluginId: string
	readonly productName: string
	readonly surfaceId: SurfaceId

	readonly registerProps: DeviceRegisterPropsComplete // TODO - explode?
}

export class SurfaceManager {
	readonly #logger = createLogger('SurfaceManager')

	readonly #surfaces: Map<SurfaceId, SurfaceInfo>
	/** Surfaces which are in the process of being opened */
	readonly #pendingSurfaces: Set<SurfaceId>
	readonly #client: CompanionSatelliteClient

	readonly #plugins = new Map<string, PluginWrapper2>()

	#enabledPluginsConfig: ApiSurfacePluginsEnabled = {}

	#statusString: string
	#scanIsRunning = false
	#scanPending = false

	public static async create(
		client: CompanionSatelliteClient,
		enabledPluginsConfig: ApiSurfacePluginsEnabled,
		loadedPlugins: LoadedPlugin[],
	): Promise<SurfaceManager> {
		const manager = new SurfaceManager(client, enabledPluginsConfig)

		// Build rawPlugins from loaded modules
		const rawPlugins: RawPluginsInfo[] = loadedPlugins.map((loaded) => ({
			info: {
				pluginId: loaded.info.pluginId,
				pluginName: loaded.info.pluginName,
			},
			plugin: loaded.plugin,
		}))

		const hostContext = manager.createHostContext()

		try {
			for (const rawPlugin of rawPlugins) {
				try {
					const hostContextFull: SurfaceHostContext = {
						...hostContext,
						notifyOpenedDiscoveredSurface: async (_info: OpenDeviceResult) => {
							throw new Error('Not implemented')
						},
					}
					const wrappedPlugin = new PluginWrapper2(hostContextFull, rawPlugin)

					// TODO: this is pretty horrible
					;(hostContextFull as any).notifyOpenedDiscoveredSurface = async (info: OpenDeviceResult) => {
						if (!manager.#tryAddSurfaceFromPlugin(wrappedPlugin, info, { type: 'detect', info })) {
							manager.#logger.warn(`Surface already exists: ${info.surfaceId}`)
						}
					}

					manager.#plugins.set(rawPlugin.info.pluginId, wrappedPlugin)
				} catch (e) {
					manager.#logger.error(`Failed to load plugin "${rawPlugin.info.pluginId}": ${e}`)
					continue
				}
			}

			// Initialize all the plugins
			await Promise.all(
				Array.from(manager.#plugins.entries()).map(async ([pluginId, plugin]) => {
					if (manager.isPluginEnabled(pluginId)) await plugin.init()
				}),
			)
		} catch (e) {
			// Something failed, cleanup
			await Promise.allSettled(Array.from(manager.#plugins.values()).map(async (p) => p.destroy()))
			throw e
		}

		return manager
	}

	private createHostContext(): Omit<SurfaceHostContext, 'notifyOpenedDiscoveredSurface'> {
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

					// this.#ipcWrapper.sendWithNoCb('disconnect', { surfaceId, reason: null })
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
				changePage: (_surfaceId: string, _forward: boolean) => {
					// Not implemented for satellite
				},
				setVariableValue: (surfaceId: string, name: string, value: any) => {
					this.#client.sendVariableValue(surfaceId, name, value)
				},
				pincodeEntry: (surfaceId: string, char: number) => {
					this.#client.pincodeKey(surfaceId, char)
				},
				firmwareUpdateInfo: (_surfaceId: string, _info) => {
					// Not implemented for satellite
				},
			},

			shouldOpenDiscoveredSurface: async (info: CheckDeviceResult): Promise<ShouldOpenSurfaceResult> => {
				// Open everything, use the surfaceId as-is
				return { shouldOpen: true, resolvedSurfaceId: info.surfaceId }
			},

			forgetDiscoveredSurfaces: (_devicePaths: string[]) => {
				// Not needed for satellite - we don't track discovered-but-not-opened surfaces
			},
			connectionsFound: (_connectionInfos) => {
				// Not implemented for satellite
			},
			connectionsForgotten: (_connectionIds: string[]) => {
				// Not implemented for satellite
			},
		}
	}

	private constructor(client: CompanionSatelliteClient, enabledPluginsConfig: ApiSurfacePluginsEnabled) {
		this.#client = client
		this.#enabledPluginsConfig = enabledPluginsConfig
		this.#surfaces = new Map()
		this.#pendingSurfaces = new Set()

		usb.on('attach', this.#onUsbAttach)
		usb.on('detach', this.#onUsbDetach)
		// Don't block process exit with the watching
		usb.unrefHotplugEvents()

		this.#statusString = 'Connecting'
		this.#showStatusCard(this.#statusString, true)

		this.scanForSurfaces()

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
						if (!msg.keyIndex) throw new Error('No controlId or keyIndex provided for draw command')

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

					// TODO: transform the image if provided to match the stylePreset

					await plugin.draw(msg.deviceId, [
						{
							controlId: controlId,
							image: msg.image,
							color: msg.color,
							text: msg.text,
						},
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

					await plugin.readySurface(msg.deviceId, {})
				},
				(e) => {
					this.#logger.error(`Setup device: ${e}`)
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
	#getPluginForSurface(surfaceId: string): PluginWrapper2 {
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

	#onUsbDetach = (dev: usb.Device): void => {
		this.#logger.debug(
			`USB device detached: vendor=${dev.deviceDescriptor?.idVendor} product=${dev.deviceDescriptor?.idProduct}`,
		)

		// Validate surfaces after a short delay to let device state settle
		setTimeout(() => void this.#validateAndCleanupSurfaces(), 500)
	}

	async #validateAndCleanupSurfaces(): Promise<void> {
		const surfaceIds = Array.from(this.#surfaces.keys())

		for (const surfaceId of surfaceIds) {
			const surface = this.#surfaces.get(surfaceId)
			if (!surface) continue

			const plugin = this.#plugins.get(surface.pluginId)
			if (!plugin) continue

			try {
				// Try to show the current status - this validates the device is still accessible
				await plugin.showStatus(surfaceId, this.#client.displayHost, this.#statusString)
			} catch (e) {
				this.#logger.info(`Surface ${surfaceId} is no longer accessible, cleaning up: ${e}`)
				this.#cleanupSurfaceById(surfaceId)
			}
		}

		// Rescan to pick up any reconnected devices
		this.scanForSurfaces()
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
					await Promise.all(
						devices.map(async (device) => {
							// Skip devices without a path - they can't be opened
							if (!device.path) return

							const hidDevice: HIDDevice = device as HIDDevice

							for (const [pluginId, plugin] of this.#plugins.entries()) {
								const info = await plugin.checkHidDevice(hidDevice)
								if (!info || !this.isPluginEnabled(pluginId)) continue

								this.#tryAddSurfaceFromPlugin(plugin, info, {
									type: 'hid',
									hid: hidDevice,
								})
								return
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
						this.#tryAddSurfaceFromPlugin(plugin, surfaceInfo, { type: 'scan', checkResult: surfaceInfo })
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

		// Disable any surfaces whose plugin has beendisabled
		for (const [surfaceId, surface] of this.#surfaces.entries()) {
			if (this.isPluginEnabled(surface.pluginId)) continue

			this.#cleanupSurfaceById(surfaceId)
		}

		// Trigger a scan, to pick up anything just enabled
		this.scanForSurfaces()
	}

	/**
	 * Add a newly installed plugin dynamically (without restart)
	 */
	public async addPlugin(loadedPlugin: LoadedPlugin): Promise<void> {
		const pluginId = loadedPlugin.info.pluginId

		// Skip if already registered
		if (this.#plugins.has(pluginId)) {
			this.#logger.warn(`Plugin "${pluginId}" already registered, skipping`)
			return
		}

		const rawPlugin: RawPluginsInfo = {
			info: {
				pluginId: loadedPlugin.info.pluginId,
				pluginName: loadedPlugin.info.pluginName,
			},
			plugin: loadedPlugin.plugin,
		}

		const hostContext = this.createHostContext()
		const hostContextFull: SurfaceHostContext = {
			...hostContext,
			notifyOpenedDiscoveredSurface: async (_info: OpenDeviceResult) => {
				throw new Error('Not implemented')
			},
		}

		const wrappedPlugin = new PluginWrapper2(hostContextFull, rawPlugin)

		// Set up the callback properly (same pattern as in create())
		;(hostContextFull as any).notifyOpenedDiscoveredSurface = async (info: OpenDeviceResult) => {
			if (!this.#tryAddSurfaceFromPlugin(wrappedPlugin, info, { type: 'detect', info })) {
				this.#logger.warn(`Surface already exists: ${info.surfaceId}`)
			}
		}

		this.#plugins.set(pluginId, wrappedPlugin)
		this.#logger.info(`Plugin "${pluginId}" registered dynamically`)

		// Initialize if enabled
		if (this.isPluginEnabled(pluginId)) {
			try {
				await wrappedPlugin.init()
				this.#logger.info(`Plugin "${pluginId}" initialized`)
			} catch (e) {
				this.#logger.error(`Plugin "${pluginId}" init failed: ${e}`)
			}
		}

		// Trigger scan to find devices
		this.scanForSurfaces()
	}

	#tryAddSurfaceFromPlugin(
		plugin: PluginWrapper2,
		pluginInfo: CheckDeviceResult | OpenDeviceResult,
		openInfo:
			| {
					type: 'scan'
					checkResult: CheckDeviceResult
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
		if (this.#pendingSurfaces.has(pluginInfo.surfaceId) || this.#surfaces.has(pluginInfo.surfaceId)) return false
		this.#pendingSurfaces.add(pluginInfo.surfaceId)

		this.#logger.debug(`adding new surface: ${pluginInfo.surfaceId}`)
		this.#logger.debug(`existing = ${JSON.stringify(Array.from(this.#surfaces.keys()))}`)

		const pOpen =
			openInfo.type === 'hid'
				? plugin.openHidDevice(openInfo.hid, pluginInfo.surfaceId)
				: openInfo.type === 'scan'
					? plugin.openScannedDevice(openInfo.checkResult, pluginInfo.surfaceId)
					: Promise.resolve(openInfo.info)

		pOpen
			.then(async (result) => {
				if (!result) return

				let bitmapSize = result.surfaceLayout.stylePresets.default.bitmap
				if (!bitmapSize) {
					bitmapSize = Object.values(result.surfaceLayout.stylePresets).find((s) => !!s.bitmap)?.bitmap
				}

				const openedInfo: SurfaceInfo = {
					pluginId: plugin.info.pluginId,
					surfaceId: pluginInfo.surfaceId,
					productName: result.description,
					registerProps: {
						brightness: result.supportsBrightness,
						surfaceManifest: translateModuleToSatelliteSurfaceLayout(result.surfaceLayout),
						transferVariables: translateModuleToSatelliteTransferVariables(result.transferVariables),

						gridSize: calculateGridSize(result.surfaceLayout),
						fallbackBitmapSize: bitmapSize ? Math.min(bitmapSize.h, bitmapSize.w) : 0,
					},
				}

				this.#surfaces.set(pluginInfo.surfaceId, openedInfo)

				this.#client.addDevice(pluginInfo.surfaceId, openedInfo.productName, openedInfo.registerProps)
			})
			.catch((e) => {
				this.#logger.error(`Open "${pluginInfo.surfaceId}" failed: ${e}`)
			})
			.finally(() => {
				this.#pendingSurfaces.delete(pluginInfo.surfaceId)
			})

		return true
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
