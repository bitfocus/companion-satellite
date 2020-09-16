import { CompanionSatelliteClient } from './client'
import { listStreamDecks, openStreamDeck, StreamDeck } from 'elgato-stream-deck'
import * as usbDetect from 'usb-detection'

type SerialNumber = string
type DeviceId = number

export class DeviceManager {
	private readonly devices: Map<SerialNumber, StreamDeck>
	private readonly devices2: Map<DeviceId, SerialNumber>
	private readonly client: CompanionSatelliteClient

	constructor(client: CompanionSatelliteClient) {
		this.client = client
		this.devices = new Map()
		this.devices2 = new Map()

		usbDetect.startMonitoring()
		usbDetect.on('add:4057', (dev) => this.foundDevice(dev))
		usbDetect.on('remove:4057', (dev) => this.removeDevice(dev))

		client.on('connected', () => {
			console.log('connected')
			this.devices2.clear()

			// TODO - reinit existing
			this.registerAll()
		})
		client.on('disconnected', () => {
			console.log('disconnected')
			this.devices2.clear()
			this.showOffline()
		})

		client.on('brightness', (d) => {
			try {
				const dev = this.devices2.get(d.deviceId)
				if (dev) {
					const dev2 = this.devices.get(dev)
					if (dev2) {
						dev2.setBrightness(d.percent)
					} else {
						console.log(`Unknown device: ${d.deviceId}`)
					}
				} else {
					console.log(`Unknown device: ${d.deviceId}`)
				}
			} catch (e) {
				console.error(`Set brightness: ${e}`)
			}
		})
		client.on('draw', (d) => {
			try {
				const dev = this.devices2.get(d.deviceId)
				if (dev) {
					const dev2 = this.devices.get(dev)
					if (dev2) {
						console.log('fill', d.deviceId, d.keyIndex)
						// TODO - scale if needed
						const key = toDeviceKey(dev2.NUM_KEYS, dev2.KEY_COLUMNS, d.keyIndex)
						if (key !== null) {
							dev2.fillImage(key, d.image)
						}
					} else {
						console.log(`Unknown device: ${d.deviceId}`)
					}
				} else {
					console.log(`Unknown device: ${d.deviceId}`)
				}
			} catch (e) {
				console.error(`Set brightness: ${e}`)
			}
		})
		client.on('newDevice', (d) => {
			try {
				if (!this.devices2.has(d.deviceId)) {
					const ind = d.serialNumber.indexOf('\u0000')
					const serial2 = ind >= 0 ? d.serialNumber.substring(0, ind) : d.serialNumber
					console.log(`${d.serialNumber}=${d.serialNumber.length}`)
					console.log(`${serial2}=${serial2.length}`)
					const dev = this.devices.get(serial2)
					if (dev) {
						this.devices2.set(d.deviceId, serial2)
						dev.on('down', (key) => {
							const key2 = toGlobalKey(dev.NUM_KEYS, dev.KEY_COLUMNS, key)
							this.client.keyDown(d.deviceId, key2)
						})
						dev.on('up', (key) => {
							const key2 = toGlobalKey(dev.NUM_KEYS, dev.KEY_COLUMNS, key)
							this.client.keyUp(d.deviceId, key2)
						})
					} else {
						console.log(`Device missing: ${d.serialNumber}`)
					}
				} else {
					// TODO better handling
					console.log(`Device already mapped: ${d.deviceId}`)
				}
			} catch (e) {
				console.error(`Setup device: ${e}`)
			}
		})
	}

	private foundDevice(dev: usbDetect.Device): void {
		// TODO
		console.log('Found a device', dev)
		this.registerAll()
	}

	private removeDevice(dev: usbDetect.Device): void {
		// TODO
		console.log('Lost a device', dev)
		const dev2 = this.devices.get(dev.serialNumber)
		if (dev2) {
			// cleanup
			this.devices.delete(dev.serialNumber)
			const k = Array.from(this.devices2.entries()).find((e) => e[1] === dev.serialNumber)
			if (k) this.devices2.delete(k[0])

			dev2.close()
		}
	}

	public registerAll(): void {
		for (const device of listStreamDecks()) {
			this.tryAddDevice(device.path)
		}
	}

	private tryAddDevice(path: string) {
		if (!this.devices.has(path)) {
			console.log(`adding new device: ${path}`)

			try {
				const sd = openStreamDeck(path)
				const serial = sd.getSerialNumber()
				this.devices.set(serial, sd)
				this.client.addDevice(serial)

				sd.on('error', (e) => {
					console.error('device error', e)
				})
			} catch (e) {
				console.log(`Open "${path}" failed: ${e}`)
			}
			// TODO
		}
	}

	private showOffline(): void {
		// TODO
	}
}

const MAX_BUTTONS = 32
const MAX_BUTTONS_PER_ROW = 8

// From Global key number 0->31, to Device key f.ex 0->14
// 0-4 would be 0-4, but 5-7 would be -1
// and 8-12 would be 5-9
function toDeviceKey(keysTotal: number, keysPerRow: number, key: number): number | null {
	if (keysTotal === MAX_BUTTONS) return key

	if (key >= MAX_BUTTONS || key < 0) {
		return null
	}

	const row = Math.floor(key / MAX_BUTTONS_PER_ROW)
	const col = key % MAX_BUTTONS_PER_ROW

	if (row >= keysTotal / keysPerRow || col >= keysPerRow) {
		return null
	}

	return row * keysPerRow + col
}

// From device key number to global key number
// Reverse of toDeviceKey
function toGlobalKey(keysTotal: number, keysPerRow: number, key: number): number {
	if (keysTotal === MAX_BUTTONS) return key

	const rows = Math.floor(key / keysPerRow)
	const col = key % keysPerRow

	return rows * MAX_BUTTONS_PER_ROW + col
}
