import {
	LoupedeckDevice,
	LoupedeckDisplayId,
	LoupedeckBufferFormat,
	LoupedeckModelId,
	LoupedeckControlType,
} from '@loupedeck/node'
import * as imageRs from '@julusian/image-rs'
import { CardGenerator } from '../cards'
import { ImageWriteQueue } from '../writeQueue'
import { ClientCapabilities, CompanionClient, DeviceDrawProps, DeviceRegisterProps, WrappedDevice } from './api'

export class LoupedeckLiveWrapper implements WrappedDevice {
	readonly #cardGenerator: CardGenerator
	readonly #deck: LoupedeckDevice
	readonly #deviceId: string

	#queueOutputId: number
	#isShowingCard = true
	#queue: ImageWriteQueue

	#companionSupportsScaling = false
	#companionSupportsCombinedEncoders = true

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

		if (
			device.modelId !== LoupedeckModelId.LoupedeckLive &&
			device.modelId !== LoupedeckModelId.RazerStreamController
		)
			throw new Error('Incorrect model passed to wrapper!')

		this.#queueOutputId = 0

		this.#queue = new ImageWriteQueue(async (key: number, buffer: Buffer) => {
			if (key > 40) {
				return
			}

			const outputId = this.#queueOutputId

			const width = this.#deck.lcdKeySize
			const height = this.#deck.lcdKeySize

			let newbuffer: Buffer = buffer
			if (!this.#companionSupportsScaling) {
				try {
					newbuffer = await imageRs.ImageTransformer.fromBuffer(buffer, 72, 72, imageRs.PixelFormat.Rgb)
						.scale(width, height)
						.toBuffer(imageRs.PixelFormat.Rgb)
				} catch (e) {
					console.log(`device(${deviceId}): scale image failed: ${e}`)
					return
				}
			}

			// Check if generated image is still valid
			if (this.#queueOutputId === outputId) {
				try {
					if (this.#isShowingCard) {
						this.#isShowingCard = false

						// Do a blank of the whole panel before drawing a button, so that there isnt any bleed
						await this.blankDevice(true)
					}

					await this.#deck.drawKeyBuffer(key, newbuffer, LoupedeckBufferFormat.RGB)
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
			bitmapSize: this.#deck.lcdKeySize,
			colours: true,
			text: false,
		}
	}

	async close(): Promise<void> {
		this.#queue?.abort()
		await this.#deck.close()
	}
	async initDevice(client: CompanionClient, status: string): Promise<void> {
		const convertButtonId = (type: 'button' | 'rotary', id: number, rotarySecondary: boolean): number => {
			if (type === 'button' && id >= 0 && id < 8) {
				return 24 + id
			} else if (type === 'rotary') {
				if (!this.#companionSupportsCombinedEncoders && rotarySecondary) {
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
				} else {
					switch (id) {
						case 0:
							return 0
						case 1:
							return 8
						case 2:
							return 16
						case 3:
							return 7
						case 4:
							return 15
						case 5:
							return 23
					}
				}
			}

			// Discard
			return 99
		}
		console.log('Registering key events for ' + this.deviceId)
		this.#deck.on('down', (info) => client.keyDown(this.deviceId, convertButtonId(info.type, info.index, true)))
		this.#deck.on('up', (info) => client.keyUp(this.deviceId, convertButtonId(info.type, info.index, true)))
		this.#deck.on('rotate', (info, delta) => {
			if (info.type !== LoupedeckControlType.Rotary) return

			const id2 = convertButtonId(info.type, info.index, false)
			if (id2 < 90) {
				if (delta < 0) {
					if (this.#companionSupportsCombinedEncoders) {
						client.rotateLeft(this.deviceId, id2)
					} else {
						client.keyUp(this.deviceId, id2)
					}
				} else if (delta > 0) {
					if (this.#companionSupportsCombinedEncoders) {
						client.rotateRight(this.deviceId, id2)
					} else {
						client.keyDown(this.deviceId, id2)
					}
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

		this.showStatus(client.host, status)
	}

	updateCapabilities(capabilities: ClientCapabilities): void {
		this.#companionSupportsScaling = capabilities.useCustomBitmapResolution
		this.#companionSupportsCombinedEncoders = capabilities.useCombinedEncoders
	}

	async deviceAdded(): Promise<void> {
		this.#queueOutputId++
	}
	async setBrightness(percent: number): Promise<void> {
		await this.#deck.setBrightness(percent / 100)
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

			await this.#deck.setButtonColor({
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
	showStatus(hostname: string, status: string): void {
		const width = this.#deck.displayMain.width
		const height = this.#deck.displayMain.height

		// abort and discard current operations
		this.#queue?.abort()
		this.#queueOutputId++
		const outputId = this.#queueOutputId
		this.#cardGenerator
			.generateBasicCard(width, height, imageRs.PixelFormat.Rgb, hostname, status)
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
						0,
						0,
					)
				}
			})
			.catch((e) => {
				console.error(`Failed to fill device`, e)
			})
	}
}
