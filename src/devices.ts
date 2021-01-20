import { CompanionSatelliteClient } from './client'
import { listStreamDecks, openStreamDeck, StreamDeck } from 'elgato-stream-deck'
import * as usbDetect from 'usb-detection'
import { ImageWriteQueue } from './writeQueue'
import sharp = require('sharp')
import EventEmitter = require('events')
import { CardGenerator } from './cards'

type SerialNumber = string
type DeviceId = number

interface StreamDeckExt {
	deck: StreamDeck
	queueOutputId: number
	queue: ImageWriteQueue | undefined
}

export class DeviceManager {
	private readonly devices: Map<SerialNumber, StreamDeckExt>
	private readonly deviceIdMap: Map<DeviceId, SerialNumber>
	private readonly client: CompanionSatelliteClient
	private readonly cardGenerator: CardGenerator

	private statusString: string

	constructor(client: CompanionSatelliteClient) {
		this.client = client
		this.devices = new Map()
		this.deviceIdMap = new Map()
		this.cardGenerator = new CardGenerator()

		usbDetect.startMonitoring()
		usbDetect.on('add:4057', (dev) => this.foundDevice(dev))
		usbDetect.on('remove:4057', (dev) => this.removeDevice(dev))

		this.statusString = 'Connecting'

		this.scanDevices()

		client.on('connected', () => {
			console.log('connected')
			this.clearIdMap()

			this.showStatusCard('Connected')

			this.registerAll()
		})
		client.on('disconnected', () => {
			console.log('disconnected')
			this.clearIdMap()

			this.showStatusCard('Disconnected')
		})
		client.on('ipChange', () => {
			this.showStatusCard()
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

	public close(): void {
		usbDetect.stopMonitoring()

		for (const dev of this.devices.values()) {
			try {
				dev.deck.close()
			} catch (e) {
				// ignore
			}
		}
	}

	private clearIdMap(): void {
		console.log('clear id map')
		for (const dev of this.devices.values()) {
			const deck = (dev.deck as unknown) as EventEmitter
			deck.removeAllListeners('down')
			deck.removeAllListeners('up')
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
				this.deckDrawStatus(device, this.statusString)
			}
		}

		this.scanDevices()
	}

	public scanDevices(): void {
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

				const devInfo: StreamDeckExt = {
					deck: sd,
					queueOutputId: 0,
					queue: undefined,
				}

				this.showNewDevice(devInfo)

				devInfo.queue =
					sd.ICON_SIZE !== 72
						? new ImageWriteQueue(async (key: number, buffer: Buffer) => {
								const outputId = devInfo.queueOutputId
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

								// Check if generated image is still valid
								if (devInfo.queueOutputId === outputId) {
									try {
										sd.fillImage(key, newbuffer)
									} catch (e_1) {
										console.error(`device(${serial}): fillImage failed: ${e_1}`)
									}
								}
						  })
						: undefined

				this.devices.set(serial, devInfo)
				this.client.addDevice(serial, sd.NUM_KEYS, sd.KEY_COLUMNS)

				sd.on('error', (e) => {
					console.error('device error', e)
				})
			} catch (e) {
				console.log(`Open "${path}" failed: ${e}`)
			}
		}
	}

	private showNewDevice(dev: StreamDeckExt): void {
		const outputId = dev.queueOutputId

		// Start with blanking it
		dev.deck.clearAllKeys()

		this.cardGenerator
			.generateBasicCard(dev.deck, 'aaa', this.statusString)
			.then((buffer) => {
				if (outputId === dev.queueOutputId) {
					// still valid
					dev.deck.fillPanel(buffer, { format: 'bgra' })
				}
			})
			.catch((e) => {
				console.error(`Failed to fill new device`, e)
			})
	}

	private deckDrawStatus(dev: StreamDeckExt, status: string): void {
		// abort and discard current operations
		dev.queue?.abort()
		dev.queueOutputId++

		const outputId = dev.queueOutputId
		this.cardGenerator
			.generateBasicCard(dev.deck, this.client.host, status)
			.then((buffer) => {
				if (outputId === dev.queueOutputId) {
					// still valid
					dev.deck.fillPanel(buffer, { format: 'bgra' })
				}
			})
			.catch((e) => {
				console.error(`Failed to fill new device`, e)
			})
	}

	private showStatusCard(status?: string): void {
		if (status !== undefined) {
			this.statusString = status
		}

		for (const dev of this.devices.values()) {
			this.deckDrawStatus(dev, this.statusString)
		}
	}
}
