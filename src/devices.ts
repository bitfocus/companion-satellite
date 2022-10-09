import { CompanionSatelliteClient } from './client'
import { getStreamDeckDeviceInfo, openStreamDeck, StreamDeck } from '@elgato-stream-deck/node'
import { usb } from 'usb'
import { CardGenerator } from './cards'
import { XencelabsQuickKeysManagerInstance, XencelabsQuickKeys } from '@xencelabs-quick-keys/node'
import { DeviceId, WrappedDevice } from './device-types/api'
import { StreamDeckWrapper } from './device-types/streamdeck'
import { QuickKeysWrapper } from './device-types/xencelabs-quick-keys'
import Infinitton = require('infinitton-idisplay')
import { InfinittonWrapper } from './device-types/infinitton'
import { LoupedeckWrapper } from './device-types/loupedeck'
import * as HID from 'node-hid'
import { openLoupedeck, listLoupedecks, LoupedeckDevice, LoupedeckModelId } from '@loupedeck/node'

// Force into hidraw mode
HID.setDriverType('hidraw')
HID.devices()

export class DeviceManager {
	private readonly devices: Map<DeviceId, WrappedDevice>
	private readonly client: CompanionSatelliteClient
	private readonly cardGenerator: CardGenerator

	private statusString: string

	constructor(client: CompanionSatelliteClient) {
		this.client = client
		this.devices = new Map()
		this.cardGenerator = new CardGenerator()

		usb.on('attach', (dev) => {
			if (dev.deviceDescriptor.idVendor === 0x0fd9) {
				this.foundDevice(dev)
			} else if (
				dev.deviceDescriptor.idVendor === 0xffff &&
				(dev.deviceDescriptor.idProduct === 0x1f40 || dev.deviceDescriptor.idProduct === 0x1f41)
			) {
				this.foundDevice(dev)
			} else if (dev.deviceDescriptor.idVendor === 0x28bd) {
				XencelabsQuickKeysManagerInstance.scanDevices().catch((e) => {
					console.error(`Quickey scan failed: ${e}`)
				})
			} else if (dev.deviceDescriptor.idVendor === 0x2ec2) {
				this.foundDevice(dev)
			}
		})
		usb.on('detach', (dev) => {
			if (dev.deviceDescriptor.idVendor === 0x0fd9) {
				this.removeDevice(dev)
			}
		})
		// Don't block process exit with the watching
		usb.unrefHotplugEvents()

		XencelabsQuickKeysManagerInstance.on('connect', (dev) => {
			this.tryAddQuickKeys(dev)
		})
		XencelabsQuickKeysManagerInstance.on('disconnect', (dev) => {
			if (dev.deviceId) {
				this.cleanupDeviceById(dev.deviceId)
			}
		})

		this.statusString = 'Connecting'

		this.scanDevices()

		client.on('connected', () => {
			console.log('connected')

			this.showStatusCard('Connected')

			this.registerAll()
		})
		client.on('disconnected', () => {
			console.log('disconnected')

			this.showStatusCard('Disconnected')
		})
		client.on('ipChange', () => {
			this.showStatusCard()
		})

		client.on('brightness', async (d) => {
			try {
				const dev = this.getDeviceInfo(d.deviceId)
				await dev.setBrightness(d.percent)
			} catch (e) {
				console.error(`Set brightness: ${e}`)
			}
		})
		client.on('clearDeck', async (d) => {
			try {
				const dev = this.getDeviceInfo(d.deviceId)
				await dev.blankDevice()
			} catch (e) {
				console.error(`Set brightness: ${e}`)
			}
		})
		client.on('draw', async (d) => {
			try {
				const dev = this.getDeviceInfo(d.deviceId)
				await dev.draw(d)
			} catch (e) {
				console.error(`Draw: ${e}`)
			}
		})
		client.on('newDevice', async (d) => {
			try {
				const dev = this.devices.get(d.deviceId)
				if (dev) {
					await dev.deviceAdded()
				} else {
					throw new Error(`Device missing: ${d.deviceId}`)
				}
			} catch (e) {
				console.error(`Setup device: ${e}`)
			}
		})
		client.on('deviceErrored', async (d) => {
			try {
				const dev = this.devices.get(d.deviceId)
				if (dev) {
					await dev.showStatus(this.client.host, d.message)

					// Try again to add the device, in case we can recover
					this.delayRetryAddOfDevice(d.deviceId)
				} else {
					throw new Error(`Device missing: ${d.deviceId}`)
				}
			} catch (e) {
				console.error(`Failed device: ${e}`)
			}
		})
	}

	private delayRetryAddOfDevice(deviceId: string) {
		setTimeout(() => {
			const dev = this.devices.get(deviceId)
			if (dev) {
				this.client.addDevice(deviceId, dev.productName, dev.getRegisterProps())
			}
		}, 1000)
	}

	public async close(): Promise<void> {
		// usbDetect.stopMonitoring()

		// Close all the devices
		await Promise.allSettled(Array.from(this.devices.values()).map((d) => d.close()))
	}

	private getDeviceInfo(deviceId: string): WrappedDevice {
		const dev = this.devices.get(deviceId)
		if (!dev) throw new Error(`Missing device for serial: "${deviceId}"`)
		return dev
	}

	private foundDevice(dev: usb.Device): void {
		console.log('Found a device', dev.deviceDescriptor)

		// most of the time it is available now
		this.scanDevices()
		// sometimes it ends up delayed
		setTimeout(() => this.scanDevices(), 1000)
	}

	private removeDevice(_dev: usb.Device): void {
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
			} catch (e) {
				// Ignore
			}
		}
	}

	public registerAll(): void {
		console.log('registerAll', Array.from(this.devices.keys()))
		for (const [_, device] of this.devices.entries()) {
			// If it is already in the process of initialising, core will give us back the same id twice, so we dont need to track it
			// if (!devices2.find((d) => d[1] === serial)) { // TODO - do something here?

			// Indicate on device
			device.showStatus(this.client.host, this.statusString)

			// Re-init device
			this.client.addDevice(device.deviceId, device.productName, device.getRegisterProps())

			// }
		}

		this.scanDevices()
	}

	public scanDevices(): void {
		const devices = HID.devices()
		for (const device of devices) {
			const sdInfo = getStreamDeckDeviceInfo(device)
			if (sdInfo && sdInfo.serialNumber) {
				this.tryAddStreamdeck(sdInfo.path, sdInfo.serialNumber)
			} else if (
				device.path &&
				device.serialNumber &&
				device.vendorId === Infinitton.VENDOR_ID &&
				Infinitton.PRODUCT_IDS.includes(device.productId)
			) {
				this.tryAddInfinitton(device.path, device.serialNumber)
			}
		}

		XencelabsQuickKeysManagerInstance.openDevicesFromArray(devices).catch((e) => {
			console.error(`Quick keys scan failed: ${e}`)
		})

		listLoupedecks()
			.then((devs) => {
				for (const dev of devs) {
					if (dev.serialNumber && dev.model === LoupedeckModelId.LoupedeckLive) {
						this.tryAddLoupedeckLive(dev.path, dev.serialNumber)
					}
				}
			})
			.catch((e) => {
				console.error(`Loupedeck scan failed: ${e}`)
			})
	}

	private async tryAddLoupedeckLive(path: string, serial: string) {
		let ld: LoupedeckDevice | undefined
		try {
			if (!this.devices.has(serial)) {
				console.log(`adding new device: ${path}`)
				console.log(`existing = ${JSON.stringify(Array.from(this.devices.keys()))}`)

				ld = await openLoupedeck(path, { waitForAcks: true })
				ld.on('error', (err) => {
					console.error('device error', err)
					this.cleanupDeviceById(serial)
				})

				const devInfo = new LoupedeckWrapper(serial, ld, this.cardGenerator)
				await this.tryAddDeviceInner(serial, devInfo)
			}
		} catch (e) {
			console.log(`Open "${path}" failed: ${e}`)
			if (ld) ld.close() //.catch((e) => null)
		}
	}

	private async tryAddStreamdeck(path: string, serial: string) {
		let sd: StreamDeck | undefined
		try {
			if (!this.devices.has(serial)) {
				console.log(`adding new device: ${path}`)
				console.log(`existing = ${JSON.stringify(Array.from(this.devices.keys()))}`)

				sd = openStreamDeck(path)
				sd.on('error', (e) => {
					console.error('device error', e)
					this.cleanupDeviceById(serial)
				})

				const devInfo = new StreamDeckWrapper(serial, sd, this.cardGenerator)
				await this.tryAddDeviceInner(serial, devInfo)
			}
		} catch (e) {
			console.log(`Open "${path}" failed: ${e}`)
			if (sd) sd.close() //.catch((e) => null)
		}
	}

	// private getAutoId(path: string, prefix: string): string {
	// 	const val = autoIdMap.get(path)
	// 	if (val) return val

	// 	const nextId = autoIdMap.size + 1
	// 	const val2 = `${prefix}-${nextId.toString().padStart(3, '0')}`
	// 	autoIdMap.set(path, val2)
	// 	return val2
	// }

	private async tryAddQuickKeys(surface: XencelabsQuickKeys) {
		// TODO - support no deviceId for wired devices
		if (!surface.deviceId) return

		try {
			const deviceId = surface.deviceId
			if (!this.devices.has(deviceId)) {
				console.log(`adding new device: ${deviceId}`)
				console.log(`existing = ${JSON.stringify(Array.from(this.devices.keys()))}`)

				// TODO - this is race prone..
				surface.on('error', (e) => {
					console.error('device error', e)
					this.cleanupDeviceById(deviceId)
				})

				const devInfo = new QuickKeysWrapper(deviceId, surface)
				await this.tryAddDeviceInner(deviceId, devInfo)
			}
		} catch (e) {
			console.log(`Open "${surface.deviceId}" failed: ${e}`)
		}
	}

	private async tryAddInfinitton(path: string, serial: string) {
		let panel: Infinitton | undefined
		try {
			if (!this.devices.has(serial)) {
				console.log(`adding new device: ${path}`)
				console.log(`existing = ${JSON.stringify(Array.from(this.devices.keys()))}`)

				panel = new Infinitton(path)
				panel.on('error', (e) => {
					console.error('device error', e)
					this.cleanupDeviceById(serial)
				})

				const devInfo = new InfinittonWrapper(serial, panel, this.cardGenerator)
				await this.tryAddDeviceInner(serial, devInfo)
			}
		} catch (e) {
			console.log(`Open "${path}" failed: ${e}`)
			if (panel) panel.close() //.catch((e) => null)
		}
	}

	private async tryAddDeviceInner(deviceId: string, devInfo: WrappedDevice): Promise<void> {
		this.devices.set(deviceId, devInfo)

		try {
			await devInfo.initDevice(this.client, this.statusString)

			this.client.addDevice(deviceId, devInfo.productName, devInfo.getRegisterProps())
		} catch (e) {
			// Remove the failed device
			this.devices.delete(deviceId)

			throw e
		}
	}

	private showStatusCard(status?: string): void {
		if (status !== undefined) {
			this.statusString = status
		}

		for (const dev of this.devices.values()) {
			dev.showStatus(this.client.host, this.statusString)
		}
	}
}
