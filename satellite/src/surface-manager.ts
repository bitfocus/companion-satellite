import { CompanionSatelliteClient } from './client.js'
import { usb } from 'usb'
import { CardGenerator } from './cards.js'
import { SurfaceId, SurfacePlugin, DiscoveredSurfaceInfo, WrappedSurface } from './device-types/api.js'
import { StreamDeckPlugin } from './device-types/streamdeck.js'
import { QuickKeysPlugin } from './device-types/xencelabs-quick-keys.js'
import * as HID from 'node-hid'
import { wrapAsync } from './lib.js'
import { InfinittonPlugin } from './device-types/infinitton.js'
import { LoupedeckPlugin } from './device-types/loupedeck-plugin.js'

// Force into hidraw mode
HID.setDriverType('hidraw')
HID.devices()

export class SurfaceManager {
	readonly #surfaces: Map<SurfaceId, WrappedSurface>
	/** Surfaces which are in the process of being opened */
	readonly #pendingSurfaces: Set<SurfaceId>
	readonly #client: CompanionSatelliteClient
	readonly #cardGenerator: CardGenerator

	readonly #plugins: SurfacePlugin<any>[] = [
		new StreamDeckPlugin(),
		new InfinittonPlugin(),
		new LoupedeckPlugin(),
		new QuickKeysPlugin(),
	]

	#statusString: string
	#scanIsRunning = false
	#scanPending = false

	public static async create(client: CompanionSatelliteClient): Promise<SurfaceManager> {
		const manager = new SurfaceManager(client)

		try {
			// Initialize all the plugins
			await Promise.all(manager.#plugins.map(async (p) => p.init()))
		} catch (e) {
			// Something failed, cleanup
			await Promise.allSettled(manager.#plugins.map(async (p) => p.destroy()))
			throw e
		}

		return manager
	}

	private constructor(client: CompanionSatelliteClient) {
		this.#client = client
		this.#surfaces = new Map()
		this.#pendingSurfaces = new Set()
		this.#cardGenerator = new CardGenerator()

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
					await surface.blankDevice()
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

					surface.showStatus(this.#client.host, msg.message)

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

			this.#client.addDevice(surfaceId, surface.productName, surface.getRegisterProps())
		}, 1000)
	}

	public async close(): Promise<void> {
		usb.off('attach', this.#onUsbAttach)
		usb.off('detach', this.#onUsbDetach)

		// Close all the devices
		await Promise.allSettled(Array.from(this.#surfaces.values()).map(async (surface) => surface.close()))

		// Cleanup all the plugins
		await Promise.allSettled(this.#plugins.map(async (plugin) => plugin.destroy()))
	}

	#getWrappedSurface(surfaceId: string): WrappedSurface {
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

		// cleanup
		this.#surfaces.delete(surfaceId)
		this.#client.removeDevice(surfaceId)
		try {
			surface.close().catch(() => {
				// Ignore
			})
		} catch (_e) {
			// Ignore
		}
	}

	public syncCapabilitiesAndRegisterAllDevices(): void {
		console.log('registerAll', Array.from(this.#surfaces.keys()))
		for (const device of this.#surfaces.values()) {
			// If it is still in the process of initialising skip it
			if (this.#pendingSurfaces.has(device.deviceId)) continue

			// Indicate on device
			device.showStatus(this.#client.host, this.#statusString)

			// Make sure device knows what the client is capable of
			device.updateCapabilities(this.#client.capabilities)

			// Re-init device
			this.#client.addDevice(device.deviceId, device.productName, device.getRegisterProps())
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
							for (const plugin of this.#plugins) {
								const info = plugin.checkSupportsHidDevice?.(device)
								if (!info) continue

								this.#tryAddSurfaceFromPlugin(plugin, info)
								return
							}
						}),
					)
				})
				.catch((e) => {
					console.error(`HID scan failed: ${e}`)
				}),

			...this.#plugins.map(async (plugin) => {
				try {
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

	// private getAutoId(path: string, prefix: string): string {
	// 	const val = autoIdMap.get(path)
	// 	if (val) return val

	// 	const nextId = autoIdMap.size + 1
	// 	const val2 = `${prefix}-${nextId.toString().padStart(3, '0')}`
	// 	autoIdMap.set(path, val2)
	// 	return val2
	// }

	#tryAddSurfaceFromPlugin<T>(plugin: SurfacePlugin<T>, pluginInfo: DiscoveredSurfaceInfo<T>): void {
		if (this.#pendingSurfaces.has(pluginInfo.surfaceId) || this.#surfaces.has(pluginInfo.surfaceId)) return
		this.#pendingSurfaces.add(pluginInfo.surfaceId)

		console.log(`adding new surface: ${pluginInfo.surfaceId}`)
		console.log(`existing = ${JSON.stringify(Array.from(this.#surfaces.keys()))}`)

		plugin
			.openSurface(pluginInfo.surfaceId, pluginInfo.pluginInfo, this.#cardGenerator)
			.then(async (surface) => {
				surface.on('error', (e) => {
					console.error('surface error', e)
					this.#cleanupSurfaceById(pluginInfo.surfaceId)
				})

				this.#surfaces.set(pluginInfo.surfaceId, surface)

				try {
					await surface.initDevice(this.#client, this.#statusString)

					surface.updateCapabilities(this.#client.capabilities)

					this.#client.addDevice(pluginInfo.surfaceId, surface.productName, surface.getRegisterProps())
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
			dev.showStatus(this.#client.host, message)
		}
	}
}
