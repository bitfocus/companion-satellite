import { LoupedeckDevice, LoupedeckDisplayId, LoupedeckBufferFormat, LoupedeckModelId } from '@loupedeck/node'
import sharp = require('sharp')
import { CompanionSatelliteClient } from '../client'
import { CardGenerator } from '../cards'
import { ImageWriteQueue } from '../writeQueue'
import { DeviceDrawProps, DeviceRegisterProps, WrappedDevice } from './api'

const screenWidth = 450
const screenHeight = 270
const keyPadding = 5

export class LoupedeckLiveSWrapper implements WrappedDevice {
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
		return this.#deck.modelName
	}

	public constructor(deviceId: string, device: LoupedeckDevice, cardGenerator: CardGenerator) {
		this.#deck = device
		this.#deviceId = deviceId
		this.#cardGenerator = cardGenerator

		if (device.modelId !== LoupedeckModelId.LoupedeckLiveS) throw new Error('Incorrect model passed to wrapper!')

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
					const x = (key % 5) * boundaryWidth
					const y = Math.floor(key / 5) * boundaryHeight

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
			keysTotal: 21,
			keysPerRow: 7,
			bitmaps: true,
			colours: true,
			text: false,
		}
	}

	async close(): Promise<void> {
		this.#queue?.abort()
		this.#deck.close()
	}
	async initDevice(client: CompanionSatelliteClient, status: string): Promise<void> {
		const convertButtonId = (type: 'button' | 'rotary', id: number): number => {
			if (type === 'button') {
				// return 24 + id
				switch (id) {
					case 0:
						return 14
					case 1:
						return 6
					case 2:
						return 13
					case 3:
						return 20
				}
			} else if (type === 'rotary') {
				switch (id) {
					case 0:
						return 0
					case 1:
						return 7
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

			const id2 = convertButtonId(info.type, info.index)
			if (id2 < 90) {
				if (delta < 0) {
					if (client.useCombinedEncoders) {
						client.rotateLeft(this.deviceId, id2)
					} else {
						client.keyUp(this.deviceId, id2)
					}
				} else if (delta > 0) {
					if (client.useCombinedEncoders) {
						client.rotateRight(this.deviceId, id2)
					} else {
						client.keyDown(this.deviceId, id2)
					}
				}
			}
		})
		const translateKeyIndex = (key: number): number => {
			const x = key % 5
			const y = Math.floor(key / 5)
			return y * 7 + x + 1
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
		let buttonIndex: number | undefined
		switch (d.keyIndex) {
			case 14:
				buttonIndex = 0
				break
			case 6:
				buttonIndex = 1
				break
			case 13:
				buttonIndex = 2
				break
			case 20:
				buttonIndex = 3
				break
		}
		if (buttonIndex !== undefined) {
			const red = d.color ? parseInt(d.color.substr(1, 2), 16) : 0
			const green = d.color ? parseInt(d.color.substr(3, 2), 16) : 0
			const blue = d.color ? parseInt(d.color.substr(5, 2), 16) : 0

			this.#deck.setButtonColor({
				id: buttonIndex,
				red,
				green,
				blue,
			})

			return
		}

		const x = (d.keyIndex % 7) - 1
		const y = Math.floor(d.keyIndex / 7)

		if (x >= 0 && x < 5) {
			const keyIndex = x + y * 5
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
					console.log('draw buffer')
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
