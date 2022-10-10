import { LoupedeckDevice, LoupedeckDisplayId, LoupedeckBufferFormat, LoupedeckModelId } from '@loupedeck/node'
import sharp = require('sharp')
import { CompanionSatelliteClient } from '../client'
import { CardGenerator } from '../cards'
import { ImageWriteQueue } from '../writeQueue'
import { DeviceDrawProps, DeviceRegisterProps, WrappedDevice } from './api'

const screenWidth = 360
const screenHeight = 270
const keyPadding = 5

export class LoupedeckWrapper implements WrappedDevice {
	readonly #cardGenerator: CardGenerator
	readonly #deck: LoupedeckDevice
	readonly #deviceId: string

	#queueOutputId: number
	#isShowingCard = true
	#queue: ImageWriteQueue

	public get deviceId(): string {
		return this.#deviceId
	}
	public get productName(): string {
		return `Satellite Loupedeck Live`
	}

	public constructor(deviceId: string, device: LoupedeckDevice, cardGenerator: CardGenerator) {
		this.#deck = device
		this.#deviceId = deviceId
		this.#cardGenerator = cardGenerator

		if (device.modelId !== LoupedeckModelId.LoupedeckLive) throw new Error('Incorrect model passed to wrapper!')
		this.#queueOutputId = 0

		this.#queue = new ImageWriteQueue(async (key: number, buffer: Buffer) => {
			if (key > 40) {
				return
			}

			const outputId = this.#queueOutputId

			const width = 80
			const height = 80
			const boundaryWidth = width + keyPadding * 2
			const boundaryHeight = height + keyPadding * 2

			let newbuffer: Buffer
			try {
				newbuffer = await sharp(buffer, { raw: { width: 72, height: 72, channels: 3 } })
					.resize(width, height)
					.raw()
					.toBuffer()
			} catch (e) {
				console.log(`device(${deviceId}): scale image failed: ${e}`)
				return
			}

			// Check if generated image is still valid
			if (this.#queueOutputId === outputId) {
				try {
					// Get offset x/y for key index
					const x = (key % 4) * boundaryWidth
					const y = Math.floor(key / 4) * boundaryHeight

					if (this.#isShowingCard) {
						this.#isShowingCard = false

						// Do a blank of the whole panel before drawing a button, so that there isnt any bleed
						await this.blankDevice(true)
					}

					await this.#deck.drawBuffer(
						LoupedeckDisplayId.Center,
						newbuffer,
						LoupedeckBufferFormat.RGB,
						width,
						height,
						x + keyPadding,
						y + keyPadding
					)
				} catch (e_1) {
					console.error(`device(${deviceId}): fillImage failed: ${e_1}`)
				}
			}
		})
	}

	getRegisterProps(): DeviceRegisterProps {
		return {
			keysTotal: 32,
			keysPerRow: 8,
			bitmaps: true,
			colours: true,
			text: true,
		}
	}

	async close(): Promise<void> {
		this.#queue?.abort()
		this.#deck.close()
	}
	async initDevice(client: CompanionSatelliteClient, status: string): Promise<void> {
		const convertButtonId = (type: 'button' | 'rotary', id: number): number => {
			if (type === 'button' && id >= 0 && id < 8) {
				return 24 + id
			} else if (type === 'rotary') {
				switch (id) {
					case 0:
						return 1
					case 1:
						return 9
					case 2:
						return 17
					case 3:
						return 6
					case 4:
						return 14
					case 5:
						return 22
				}
			}

			// Discard
			return 99
		}
		console.log('Registering key events for ' + this.deviceId)
		this.#deck.on('down', (info) => client.keyDown(this.deviceId, convertButtonId(info.type, info.index)))
		this.#deck.on('up', (info) => client.keyUp(this.deviceId, convertButtonId(info.type, info.index)))
		this.#deck.on('rotate', (info, delta) => {
			if (info.type !== 'rotary') return

			let id2
			switch (info.index) {
				case 0:
					id2 = 0
					break
				case 1:
					id2 = 8
					break
				case 2:
					id2 = 16
					break
				case 3:
					id2 = 7
					break
				case 4:
					id2 = 15
					break
				case 5:
					id2 = 23
					break
			}

			if (id2 !== undefined) {
				if (delta < 0) {
					client.keyUp(this.deviceId, id2)
				} else if (delta > 0) {
					client.keyDown(this.deviceId, id2)
				}
			}
		})
		const translateKeyIndex = (key: number): number => {
			const x = key % 4
			const y = Math.floor(key / 4)
			return y * 8 + x + 2
		}
		this.#deck.on('touchstart', (data) => {
			for (const touch of data.changedTouches) {
				if (touch.target.key !== undefined) {
					client.keyDown(this.deviceId, translateKeyIndex(touch.target.key))
				}
			}
		})
		this.#deck.on('touchend', (data) => {
			for (const touch of data.changedTouches) {
				if (touch.target.key !== undefined) {
					client.keyUp(this.deviceId, translateKeyIndex(touch.target.key))
				}
			}
		})

		// Start with blanking it
		await this.blankDevice()

		await this.showStatus(client.host, status)
	}

	async deviceAdded(): Promise<void> {
		this.#queueOutputId++
	}
	async setBrightness(percent: number): Promise<void> {
		this.#deck.setBrightness(percent / 100)
	}
	async blankDevice(skipButtons?: boolean): Promise<void> {
		await this.#deck.blankDevice(true, !skipButtons)
	}
	async draw(d: DeviceDrawProps): Promise<void> {
		if (d.keyIndex >= 24 && d.keyIndex < 32) {
			const index = d.keyIndex - 24

			const red = d.color ? parseInt(d.color.substr(1, 2), 16) : 0
			const green = d.color ? parseInt(d.color.substr(3, 2), 16) : 0
			const blue = d.color ? parseInt(d.color.substr(5, 2), 16) : 0

			this.#deck.setButtonColor({
				id: index,
				red,
				green,
				blue,
			})

			return
		}
		const x = (d.keyIndex % 8) - 2
		const y = Math.floor(d.keyIndex / 8)

		if (x >= 0 && x < 4) {
			const keyIndex = x + y * 4
			if (d.image) {
				this.#queue.queue(keyIndex, d.image)
			} else {
				throw new Error(`Cannot draw for Loupedeck without image`)
			}
		}
	}
	async showStatus(hostname: string, status: string): Promise<void> {
		const width = screenWidth - keyPadding * 2
		const height = screenHeight - keyPadding * 2

		// abort and discard current operations
		this.#queue?.abort()
		this.#queueOutputId++
		const outputId = this.#queueOutputId
		this.#cardGenerator
			.generateBasicCard(width, height, hostname, status)
			.then(async (buffer) => {
				if (outputId === this.#queueOutputId) {
					this.#isShowingCard = true
					// still valid
					await this.#deck.drawBuffer(
						LoupedeckDisplayId.Center,
						buffer,
						LoupedeckBufferFormat.RGB,
						width,
						height,
						keyPadding,
						keyPadding
					)
				}
			})
			.catch((e) => {
				console.error(`Failed to fill device`, e)
			})
	}
}
