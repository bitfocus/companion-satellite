import { CompanionSatelliteClient } from './client.js'
import { usb } from 'usb'
import { CardGenerator } from './graphics/cards.js'
import { SurfaceId, SurfacePlugin, DiscoveredSurfaceInfo } from './device-types/api.js'
import { StreamDeckPlugin } from './device-types/streamdeck.js'
import { QuickKeysPlugin } from './device-types/xencelabs-quick-keys.js'
import * as HID from 'node-hid'
import { wrapAsync } from './lib.js'
import { InfinittonPlugin } from './device-types/infinitton.js'
import { LoupedeckPlugin } from './device-types/loupedeck-plugin.js'
import { ApiSurfaceInfo, ApiSurfacePluginInfo, ApiSurfacePluginsEnabled } from './apiTypes.js'
import { BlackmagicControllerPlugin } from './device-types/blackmagic-panel.js'
import { SurfaceProxy, SurfaceProxyContext } from './surfaceProxy.js'
import { LockingGraphicsGenerator, SurfaceGraphicsContext } from './graphics/lib.js'

// Force into hidraw mode
HID.setDriverType('hidraw')
HID.devices()

const knownPlugins: SurfacePlugin<any>[] = [
	new StreamDeckPlugin(),
	new InfinittonPlugin(),
	new LoupedeckPlugin(),
	new QuickKeysPlugin(),
	new BlackmagicControllerPlugin(),
]

export class SurfaceManager {
	readonly #surfaces: Map<SurfaceId, SurfaceProxy>
	/** Surfaces which are in the process of being opened */
	readonly #pendingSurfaces: Set<SurfaceId>
	readonly #client: CompanionSatelliteClient
	readonly #graphics: SurfaceGraphicsContext

	readonly #plugins = new Map<string, SurfacePlugin<any>>()

	#enabledPluginsConfig: ApiSurfacePluginsEnabled = {}

	#statusString: string
	#scanIsRunning = false
	#scanPending = false

	public static async create(
		client: CompanionSatelliteClient,
		enabledPluginsConfig: ApiSurfacePluginsEnabled,
	): Promise<SurfaceManager> {
		const manager = new SurfaceManager(client, enabledPluginsConfig)

		try {
			for (const plugin of knownPlugins) {
				manager.#plugins.set(plugin.pluginId, plugin)

				if (plugin.detection) {
					plugin.detection.on('deviceAdded', (info) => {
						if (!manager.#tryAddSurfaceFromPlugin(plugin, info)) {
							console.log('Surface already exists', info.surfaceId)
						}
					})
					plugin.detection.on('deviceRemoved', (surfaceId) => {
						manager.#cleanupSurfaceById(surfaceId)
					})
				}
			}

			// Initialize all the plugins
			await Promise.all(
				Array.from(manager.#plugins.values()).map(async (p) => {
					if (manager.isPluginEnabled(p.pluginId)) await p.init()
				}),
			)
		} catch (e) {
			// Something failed, cleanup
			await Promise.allSettled(Array.from(manager.#plugins.values()).map(async (p) => p.destroy()))
			throw e
		}

		return manager
	}

	private constructor(client: CompanionSatelliteClient, enabledPluginsConfig: ApiSurfacePluginsEnabled) {
		this.#client = client
		this.#enabledPluginsConfig = enabledPluginsConfig
		this.#surfaces = new Map()
		this.#pendingSurfaces = new Set()
		this.#graphics = {
			cards: new CardGenerator(),
			locking: new LockingGraphicsGenerator(),
		}

		usb.on('attach', this.#onUsbAttach)
		usb.on('detach', this.#onUsbDetach)
		// Don't block process exit with the watching
		usb.unrefHotplugEvents()

		this.#statusString = 'Connecting'
		this.#showStatusCard(this.#statusString, true)

		this.scanForSurfaces()

		client.on('connected', () => {
			console.log('connected')

			this.#showStatusCard('Connected', false)

			this.syncCapabilitiesAndRegisterAllDevices()
		})
		client.on('disconnected', () => {
			console.log('disconnected')

			this.#showStatusCard('Connecting', true)
		})
		client.on('connecting', () => {
			this.#showStatusCard('Connecting', true)
		})

		client.on(
			'brightness',
			wrapAsync(
				async (msg) => {
					const surface = this.#getWrappedSurface(msg.deviceId)
					await surface.setBrightness(msg.percent)
				},
				(e) => {
					console.error(`Set brightness: ${e}`)
				},
			),
		)
		client.on(
			'clearDeck',
			wrapAsync(
				async (msg) => {
					const surface = this.#getWrappedSurface(msg.deviceId)
					surface.blankDevice()
				},
				(e) => {
					console.error(`Clear deck: ${e}`)
				},
			),
		)
		client.on(
			'draw',
			wrapAsync(
				async (msg) => {
					const surface = this.#getWrappedSurface(msg.deviceId)
					await surface.draw(msg)
				},
				(e) => {
					console.error(`Draw: ${e}`)
				},
			),
		)
		client.on(
			'variableValue',
			wrapAsync(
				async (msg) => {
					const surface = this.#getWrappedSurface(msg.deviceId)
					surface.onVariableValue(msg.name, msg.value)
				},
				(e) => {
					console.error(`Clear deck: ${e}`)
				},
			),
		)
		client.on(
			'lockedState',
			wrapAsync(
				async (msg) => {
					const surface = this.#getWrappedSurface(msg.deviceId)
					surface.onLockedStatus(msg.locked, msg.characterCount)
				},
				(e) => {
					console.error(`Clear deck: ${e}`)
				},
			),
		)
		client.on(
			'newDevice',
			wrapAsync(
				async (msg) => {
					const surface = this.#getWrappedSurface(msg.deviceId)
					await surface.deviceAdded()
				},
				(e) => {
					console.error(`Setup device: ${e}`)
				},
			),
		)
		client.on(
			'deviceErrored',
			wrapAsync(
				async (msg) => {
					const surface = this.#getWrappedSurface(msg.deviceId)

					surface.showStatus(this.#client.displayHost, msg.message)

					// Try again to add the device, in case we can recover
					this.#delayRetryAddOfDevice(msg.deviceId)
				},
				(e) => {
					console.error(`Failed device: ${e}`)
				},
			),
		)
	}

	#delayRetryAddOfDevice(surfaceId: string) {
		setTimeout(() => {
			const surface = this.#surfaces.get(surfaceId)
			if (!surface) return

			console.log('retry add', surfaceId)

			// Make sure device knows what the client is capable of
			surface.updateCapabilities(this.#client.capabilities)

			this.#client.addDevice(surfaceId, surface.productName, surface.registerProps)
		}, 1000)
	}

	public async close(): Promise<void> {
		usb.off('attach', this.#onUsbAttach)
		usb.off('detach', this.#onUsbDetach)

		// Close all the devices
		await Promise.allSettled(Array.from(this.#surfaces.values()).map(async (surface) => surface.close()))

		// Cleanup all the plugins
		await Promise.allSettled(
			Array.from(this.#plugins.values()).map(async (plugin) => {
				await plugin.destroy()

				// Cleanup any listeners
				plugin.detection?.removeAllListeners()
			}),
		)
	}

	#getWrappedSurface(surfaceId: string): SurfaceProxy {
		const surface = this.#surfaces.get(surfaceId)
		if (!surface) throw new Error(`Missing device for serial: "${surfaceId}"`)
		return surface
	}

	#onUsbAttach = (dev: usb.Device): void => {
		console.log('Found a usb device', dev.deviceDescriptor)

		// most of the time it is available now
		this.scanForSurfaces()
		// sometimes it ends up delayed
		setTimeout(() => this.scanForSurfaces(), 1000)
	}

	#onUsbDetach = (_dev: usb.Device): void => {
		// Rescan after a short timeout
		// setTimeout(() => this.scanDevices(), 100)
		// console.log('Lost a device', dev.deviceDescriptor)
		// this.cleanupDeviceById(dev.serialNumber)
	}

	#cleanupSurfaceById(surfaceId: string): void {
		const surface = this.#surfaces.get(surfaceId)
		if (!surface) return

		try {
			// cleanup
			this.#surfaces.delete(surfaceId)
			this.#client.removeDevice(surfaceId)

			surface.close().catch(() => {
				// Ignore
			})
		} catch (_e) {
			// Ignore
		}
	}

	public syncCapabilitiesAndRegisterAllDevices(): void {
		console.log('registerAll', Array.from(this.#surfaces.keys()))
		for (const surface of this.#surfaces.values()) {
			// If it is still in the process of initialising skip it
			if (this.#pendingSurfaces.has(surface.surfaceId)) continue

			// Indicate on device
			surface.showStatus(this.#client.displayHost, this.#statusString)

			// Make sure device knows what the client is capable of
			surface.updateCapabilities(this.#client.capabilities)

			// Re-init device
			this.#client.addDevice(surface.surfaceId, surface.productName, surface.registerProps)
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
							for (const plugin of this.#plugins.values()) {
								const info = plugin.checkSupportsHidDevice?.(device)
								if (!info || !this.isPluginEnabled(plugin.pluginId)) continue

								this.#tryAddSurfaceFromPlugin(plugin, info)
								return
							}
						}),
					)
				})
				.catch((e) => {
					console.error(`HID scan failed: ${e}`)
				}),

			...Array.from(this.#plugins.values()).map(async (plugin) => {
				try {
					if (!this.isPluginEnabled(plugin.pluginId)) return

					if (plugin.scanForSurfaces) {
						const surfaceInfos = await plugin.scanForSurfaces()
						for (const surfaceInfo of surfaceInfos) {
							this.#tryAddSurfaceFromPlugin(plugin, surfaceInfo)
						}
					} else if (plugin.detection?.triggerScan) {
						await plugin.detection.triggerScan()
					}
				} catch (e) {
					console.error(`Plugin "${plugin.pluginId}" scan failed: ${e}`)
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
				pluginName: this.#plugins.get(surface.pluginId)?.pluginName ?? 'Unknown',
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
			.map((plugin) => ({
				pluginId: plugin.pluginId,
				pluginName: plugin.pluginName,
				pluginComment: plugin.pluginComment,
			}))
			.sort((a, b) => a.pluginName.localeCompare(b.pluginName))
	}

	private isPluginEnabled(pluginId: string): boolean {
		return this.#enabledPluginsConfig[pluginId] ?? false
	}

	public updatePluginsEnabled(enabledPlugins: ApiSurfacePluginsEnabled): void {
		const oldEnabledPlugins = this.#enabledPluginsConfig
		this.#enabledPluginsConfig = enabledPlugins

		// call init/destroy as needed
		for (const plugin of this.#plugins.values()) {
			const wasEnabled = oldEnabledPlugins[plugin.pluginId] ?? false
			const isEnabled = this.isPluginEnabled(plugin.pluginId)
			if (wasEnabled === isEnabled) continue

			if (isEnabled) {
				plugin.init().catch((e) => {
					console.error(`Plugin "${plugin.pluginId}" init failed: ${e}`)
				})
			} else {
				plugin.destroy().catch((e) => {
					console.error(`Plugin "${plugin.pluginId}" destroy failed: ${e}`)
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

	// private getAutoId(path: string, prefix: string): string {
	// 	const val = autoIdMap.get(path)
	// 	if (val) return val

	// 	const nextId = autoIdMap.size + 1
	// 	const val2 = `${prefix}-${nextId.toString().padStart(3, '0')}`
	// 	autoIdMap.set(path, val2)
	// 	return val2
	// }

	#tryAddSurfaceFromPlugin<T>(plugin: SurfacePlugin<T>, pluginInfo: DiscoveredSurfaceInfo<T>): boolean {
		if (this.#pendingSurfaces.has(pluginInfo.surfaceId) || this.#surfaces.has(pluginInfo.surfaceId)) return false
		this.#pendingSurfaces.add(pluginInfo.surfaceId)

		console.log(`adding new surface: ${pluginInfo.surfaceId}`)
		console.log(`existing = ${JSON.stringify(Array.from(this.#surfaces.keys()))}`)

		const context = new SurfaceProxyContext(this.#client, pluginInfo.surfaceId, (e) => {
			console.error('surface error', e)
			this.#cleanupSurfaceById(pluginInfo.surfaceId)
		})

		plugin
			.openSurface(pluginInfo.surfaceId, pluginInfo.pluginInfo, context)
			.then(async ({ surface, registerProps }) => {
				try {
					if (plugin.pluginId !== surface.pluginId) {
						throw new Error('Plugin ID mismatch')
					}

					const proxySurface = new SurfaceProxy(this.#graphics, context, surface, registerProps)

					this.#surfaces.set(pluginInfo.surfaceId, proxySurface)

					await proxySurface.initDevice(this.#client.displayHost, this.#statusString)

					proxySurface.updateCapabilities(this.#client.capabilities)

					this.#client.addDevice(pluginInfo.surfaceId, proxySurface.productName, registerProps)
				} catch (e) {
					// Remove the failed surface
					this.#surfaces.delete(pluginInfo.surfaceId)

					// Ensure the surface is not leaked
					surface.close().catch(() => {})

					throw e
				}
			})
			.catch((e) => {
				console.log(`Open "${pluginInfo.surfaceId}" failed: ${e}`)
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
			dev.showStatus(this.#client.displayHost, message)
		}
	}
}
