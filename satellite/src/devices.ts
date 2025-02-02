import { CompanionSatelliteClient } from './client.js'
import { usb } from 'usb'
import { CardGenerator } from './cards.js'
import { DeviceId, SurfacePlugin, DiscoveredSurfaceInfo, WrappedSurface } from './device-types/api.js'
import { StreamDeckPlugin } from './device-types/streamdeck.js'
import { QuickKeysPlugin } from './device-types/xencelabs-quick-keys.js'
import * as HID from 'node-hid'
import { wrapAsync } from './lib.js'
import { InfinittonPlugin } from './device-types/infinitton.js'
import { LoupedeckPlugin } from './device-types/loupedeck-plugin.js'

// Force into hidraw mode
HID.setDriverType('hidraw')
HID.devices()

export class DeviceManager {
	private readonly devices: Map<DeviceId, WrappedSurface>
	private readonly pendingDevices: Set<DeviceId>
	private readonly client: CompanionSatelliteClient
	private readonly cardGenerator: CardGenerator

	private readonly plugins: SurfacePlugin<any>[] = [
		new StreamDeckPlugin(),
		new InfinittonPlugin(),
		new LoupedeckPlugin(),
		new QuickKeysPlugin(),
	]

	private statusString: string
	private scanIsRunning = false
	private scanPending = false

	public static async create(client: CompanionSatelliteClient): Promise<DeviceManager> {
		const manager = new DeviceManager(client)

		try {
			// Initialize all the plugins
			await Promise.all(manager.plugins.map(async (p) => p.init()))
		} catch (e) {
			// Something failed, cleanup
			await Promise.allSettled(manager.plugins.map(async (p) => p.destroy()))
			throw e
		}

		return manager
	}

	private constructor(client: CompanionSatelliteClient) {
		this.client = client
		this.devices = new Map()
		this.pendingDevices = new Set()
		this.cardGenerator = new CardGenerator()

		usb.on('attach', this.foundDevice)
		usb.on('detach', this.removeDevice)
		// Don't block process exit with the watching
		usb.unrefHotplugEvents()

		this.statusString = 'Connecting'
		this.showStatusCard(this.statusString, true)

		this.scanDevices()

		client.on('connected', () => {
			console.log('connected')

			this.showStatusCard('Connected', false)

			this.syncCapabilitiesAndRegisterAllDevices()
		})
		client.on('disconnected', () => {
			console.log('disconnected')

			this.showStatusCard('Connecting', true)
		})
		client.on('connecting', () => {
			this.showStatusCard('Connecting', true)
		})

		client.on(
			'brightness',
			wrapAsync(
				async (d) => {
					const dev = this.getDeviceInfo(d.deviceId)
					await dev.setBrightness(d.percent)
				},
				(e) => {
					console.error(`Set brightness: ${e}`)
				},
			),
		)
		client.on(
			'clearDeck',
			wrapAsync(
				async (d) => {
					const dev = this.getDeviceInfo(d.deviceId)
					await dev.blankDevice()
				},
				(e) => {
					console.error(`Clear deck: ${e}`)
				},
			),
		)
		client.on(
			'draw',
			wrapAsync(
				async (d) => {
					const dev = this.getDeviceInfo(d.deviceId)
					await dev.draw(d)
				},
				(e) => {
					console.error(`Draw: ${e}`)
				},
			),
		)
		client.on(
			'newDevice',
			wrapAsync(
				async (d) => {
					const dev = this.getDeviceInfo(d.deviceId)
					await dev.deviceAdded()
				},
				(e) => {
					console.error(`Setup device: ${e}`)
				},
			),
		)
		client.on(
			'deviceErrored',
			wrapAsync(
				async (d) => {
					const dev = this.getDeviceInfo(d.deviceId)

					dev.showStatus(this.client.host, d.message)

					// Try again to add the device, in case we can recover
					this.delayRetryAddOfDevice(d.deviceId)
				},
				(e) => {
					console.error(`Failed device: ${e}`)
				},
			),
		)
	}

	private delayRetryAddOfDevice(deviceId: string) {
		setTimeout(() => {
			const dev = this.devices.get(deviceId)
			if (dev) {
				console.log('try add', deviceId)

				// Make sure device knows what the client is capable of
				dev.updateCapabilities(this.client.capabilities)

				this.client.addDevice(deviceId, dev.productName, dev.getRegisterProps())
			}
		}, 1000)
	}

	public async close(): Promise<void> {
		usb.off('attach', this.foundDevice)
		usb.off('detach', this.removeDevice)
		// usbDetect.stopMonitoring()

		// Close all the devices
		await Promise.allSettled(Array.from(this.devices.values()).map(async (d) => d.close()))

		// Cleanup all the plugins
		await Promise.allSettled(this.plugins.map(async (p) => p.destroy()))
	}

	private getDeviceInfo(deviceId: string): WrappedSurface {
		const dev = this.devices.get(deviceId)
		if (!dev) throw new Error(`Missing device for serial: "${deviceId}"`)
		return dev
	}

	private foundDevice = (dev: usb.Device): void => {
		console.log('Found a device', dev.deviceDescriptor)

		// most of the time it is available now
		this.scanDevices()
		// sometimes it ends up delayed
		setTimeout(() => this.scanDevices(), 1000)
	}

	private removeDevice = (_dev: usb.Device): void => {
		// Rescan after a short timeout
		// setTimeout(() => this.scanDevices(), 100)
		// console.log('Lost a device', dev.deviceDescriptor)
		// this.cleanupDeviceById(dev.serialNumber)
	}
	private cleanupDeviceById(id: string): void {
		const dev2 = this.devices.get(id)
		if (dev2) {
			// cleanup
			this.devices.delete(id)
			this.client.removeDevice(id)
			try {
				dev2.close().catch(() => {
					// Ignore
				})
			} catch (_e) {
				// Ignore
			}
		}
	}

	public syncCapabilitiesAndRegisterAllDevices(): void {
		console.log('registerAll', Array.from(this.devices.keys()))
		for (const device of this.devices.values()) {
			// If it is still in the process of initialising skip it
			if (this.pendingDevices.has(device.deviceId)) continue

			// Indicate on device
			device.showStatus(this.client.host, this.statusString)

			// Make sure device knows what the client is capable of
			device.updateCapabilities(this.client.capabilities)

			// Re-init device
			this.client.addDevice(device.deviceId, device.productName, device.getRegisterProps())
		}

		this.scanDevices()
	}

	public scanDevices(): void {
		if (this.scanIsRunning) {
			this.scanPending = true
			return
		}

		this.scanIsRunning = true
		this.scanPending = false

		void Promise.allSettled([
			HID.devicesAsync()
				.then(async (devices) => {
					await Promise.all(
						devices.map(async (device) => {
							for (const plugin of this.plugins) {
								const info = plugin.checkSupportsHidDevice?.(device)
								if (!info) continue

								this.tryAddDeviceOuter(plugin, info)
								return
							}
						}),
					)
				})
				.catch((e) => {
					console.error(`HID scan failed: ${e}`)
				}),

			...this.plugins.map(async (plugin) => {
				try {
					if (plugin.scanForSurfaces) {
						const devices = await plugin.scanForSurfaces()
						for (const device of devices) {
							this.tryAddDeviceOuter(plugin, device)
						}
					} else if (plugin.detection?.triggerScan) {
						await plugin.detection.triggerScan()
					}
				} catch (e) {
					console.error(`Plugin "${plugin.pluginId}" scan failed: ${e}`)
				}
			}),
		]).finally(() => {
			this.scanIsRunning = false

			if (this.scanPending) {
				this.scanDevices()
			}
		})
	}

	private canAddDevice(deviceId: string): boolean {
		return !this.pendingDevices.has(deviceId) && !this.devices.has(deviceId)
	}

	// private getAutoId(path: string, prefix: string): string {
	// 	const val = autoIdMap.get(path)
	// 	if (val) return val

	// 	const nextId = autoIdMap.size + 1
	// 	const val2 = `${prefix}-${nextId.toString().padStart(3, '0')}`
	// 	autoIdMap.set(path, val2)
	// 	return val2
	// }

	private tryAddDeviceOuter<T>(plugin: SurfacePlugin<T>, pluginInfo: DiscoveredSurfaceInfo<T>): void {
		if (!this.canAddDevice(pluginInfo.surfaceId)) return

		console.log(`adding new device: ${pluginInfo.surfaceId}`)
		console.log(`existing = ${JSON.stringify(Array.from(this.devices.keys()))}`)

		this.pendingDevices.add(pluginInfo.surfaceId)

		plugin
			.openSurface(pluginInfo.surfaceId, pluginInfo.pluginInfo, this.cardGenerator)
			.then(async (dev) => this.tryAddDeviceInner(pluginInfo.surfaceId, dev))
			.catch((e) => {
				console.log(`Open "${pluginInfo.surfaceId}" failed: ${e}`)
			})
			.finally(() => {
				this.pendingDevices.delete(pluginInfo.surfaceId)
			})
	}

	private async tryAddDeviceInner(deviceId: string, devInfo: WrappedSurface): Promise<void> {
		devInfo.on('error', (e) => {
			console.error('device error', e)
			this.cleanupDeviceById(deviceId)
		})

		this.devices.set(deviceId, devInfo)

		try {
			await devInfo.initDevice(this.client, this.statusString)

			devInfo.updateCapabilities(this.client.capabilities)

			this.client.addDevice(deviceId, devInfo.productName, devInfo.getRegisterProps())
		} catch (e) {
			// Remove the failed device
			this.devices.delete(deviceId)

			// Ensure the device is not leaked
			devInfo.close().catch(() => {})

			throw e
		}
	}

	private statusCardTimer: NodeJS.Timeout | undefined
	private showStatusCard(message: string, runLoop: boolean): void {
		this.statusString = message

		if (this.statusCardTimer) {
			clearInterval(this.statusCardTimer)
			delete this.statusCardTimer
		}

		if (runLoop) {
			let dots = ''
			this.statusCardTimer = setInterval(() => {
				dots += ' .'
				if (dots.length > 7) dots = ''

				this.doDrawStatusCard(message + dots)
			}, 1000)
		}

		this.doDrawStatusCard(message)
	}

	private doDrawStatusCard(message: string) {
		for (const dev of this.devices.values()) {
			dev.showStatus(this.client.host, message)
		}
	}
}
