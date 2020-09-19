import { CompanionSatelliteClient } from './client'
import { listStreamDecks, openStreamDeck, StreamDeck } from 'elgato-stream-deck'
import * as usbDetect from 'usb-detection'
import { ImageWriteQueue } from './writeQueue'
import sharp = require('sharp')

type SerialNumber = string
type DeviceId = number

interface StreamDeckExt {
	deck: StreamDeck
	queue: ImageWriteQueue | undefined
}

export class DeviceManager {
	private readonly devices: Map<SerialNumber, StreamDeckExt>
	private readonly deviceIdMap: Map<DeviceId, SerialNumber>
	private readonly client: CompanionSatelliteClient

	constructor(client: CompanionSatelliteClient) {
		this.client = client
		this.devices = new Map()
		this.deviceIdMap = new Map()

		usbDetect.startMonitoring()
		usbDetect.on('add:4057', (dev) => this.foundDevice(dev))
		usbDetect.on('remove:4057', (dev) => this.removeDevice(dev))

		client.on('connected', () => {
			console.log('connected')
			this.clearIdMap()

			this.registerAll()
		})
		client.on('disconnected', () => {
			console.log('disconnected')
			this.clearIdMap()
			this.showOffline()
		})

		client.on('brightness', (d) => {
			try {
				const dev = this.getDeviceInfo(d.deviceId)[1]
				dev.deck.setBrightness(d.percent)
			} catch (e) {
				console.error(`Set brightness: ${e}`)
			}
		})
		client.on('draw', (d) => {
			try {
				const dev = this.getDeviceInfo(d.deviceId)[1]
				if (dev.queue) {
					dev.queue.queue(d.keyIndex, d.image)
				} else {
					dev.deck.fillImage(d.keyIndex, d.image)
				}
			} catch (e) {
				console.error(`Draw: ${e}`)
			}
		})
		client.on('newDevice', (d) => {
			try {
				if (!this.deviceIdMap.has(d.deviceId)) {
					const ind = d.serialNumber.indexOf('\u0000')
					const serial2 = ind >= 0 ? d.serialNumber.substring(0, ind) : d.serialNumber
					console.log(`${d.serialNumber}=${d.serialNumber.length}`)
					console.log(`${serial2}=${serial2.length}`)
					const dev = this.devices.get(serial2)
					if (dev) {
						this.deviceIdMap.set(d.deviceId, serial2)
						console.log('Registering key evenrs for ' + d.deviceId)
						dev.deck.on('down', (key) => this.client.keyDown(d.deviceId, key))
						dev.deck.on('up', (key) => this.client.keyUp(d.deviceId, key))
					} else {
						throw new Error(`Device missing: ${d.serialNumber}`)
					}
				} else {
					throw new Error(`Device already mapped: ${d.deviceId}`)
				}
			} catch (e) {
				console.error(`Setup device: ${e}`)
			}
		})
	}

	private clearIdMap(): void {
		console.log('clear id map')
		for (const dev of this.devices.values()) {
			// @ts-expect-error
			dev.deck.removeAllListeners('down')
			// @ts-expect-error
			dev.deck.removeAllListeners('up')
		}
		this.deviceIdMap.clear()
	}

	private getDeviceInfo(deviceId: number): [string, StreamDeckExt] {
		const serial = this.deviceIdMap.get(deviceId)
		if (!serial) throw new Error(`Unknown deviceId: ${deviceId}`)

		const sd = this.devices.get(serial)
		if (!sd) throw new Error(`Missing device for serial: "${serial}"`)
		return [serial, sd]
	}

	private foundDevice(dev: usbDetect.Device): void {
		console.log('Found a device', dev)
		this.registerAll()
	}

	private removeDevice(dev: usbDetect.Device): void {
		console.log('Lost a device', dev)
		const dev2 = this.devices.get(dev.serialNumber)
		if (dev2) {
			// cleanup
			this.devices.delete(dev.serialNumber)
			const k = Array.from(this.deviceIdMap.entries()).find((e) => e[1] === dev.serialNumber)
			if (k) {
				this.deviceIdMap.delete(k[0])
				this.client.removeDevice(k[0])
			}

			dev2.queue?.abort()
			try {
				dev2.deck.close()
			} catch (e) {
				// Ignore
			}
		}
	}

	public registerAll(): void {
		const devices2 = Array.from(this.deviceIdMap.entries())
		for (const [serial, device] of this.devices.entries()) {
			// If it is already in the process of initialising, core will give us back the same id twice, so we dont need to track it
			if (!devices2.find((d) => d[1] === serial)) {
				// Re-init device
				this.client.addDevice(serial, device.deck.NUM_KEYS, device.deck.KEY_COLUMNS)

				// Indicate on device
				// TODO
				device.deck.clearAllKeys()
				device.deck.fillColor(0, 0, 255, 0)
			}
		}

		for (const device of listStreamDecks()) {
			this.tryAddDevice(device.path, device.serialNumber ?? '')
		}
	}

	private tryAddDevice(path: string, serial: string) {
		if (!this.devices.has(serial)) {
			console.log(`adding new device: ${path}`)
			console.log(`existing = ${JSON.stringify(Array.from(this.devices.keys()))}`)

			try {
				const sd = openStreamDeck(path, { resetToLogoOnExit: true })
				const serial = sd.getSerialNumber()

				const queue =
					sd.ICON_SIZE !== 72
						? new ImageWriteQueue(async (key: number, buffer: Buffer) => {
								let newbuffer: Buffer | null = null
								try {
									newbuffer = await sharp(buffer, { raw: { width: 72, height: 72, channels: 3 } })
										.resize(96, 96)
										.raw()
										.toBuffer()
								} catch (e) {
									console.error(`device(${serial}): scale image failed: ${e}`)
									return
								}

								try {
									sd.fillImage(key, newbuffer)
								} catch (e_1) {
									console.error(`device(${serial}): fillImage failed: ${e_1}`)
								}
						  })
						: undefined

				this.devices.set(serial, {
					deck: sd,
					queue,
				})
				this.client.addDevice(serial, sd.NUM_KEYS, sd.KEY_COLUMNS)

				sd.on('error', (e) => {
					console.error('device error', e)
				})
			} catch (e) {
				console.log(`Open "${path}" failed: ${e}`)
			}
		}
	}

	private showOffline(): void {
		// TODO
		for (const dev of this.devices.values()) {
			dev.deck.clearAllKeys()
			dev.deck.fillColor(0, 255, 0, 0)
		}
	}
}
