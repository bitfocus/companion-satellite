import { DeviceModelId, StreamDeck } from '@elgato-stream-deck/node'
import * as imageRs from '@julusian/image-rs'
import { CardGenerator } from '../cards'
import { ImageWriteQueue } from '../writeQueue'
import { ClientCapabilities, CompanionClient, DeviceDrawProps, DeviceRegisterProps, WrappedDevice } from './api'

export class StreamDeckWrapper implements WrappedDevice {
	readonly #cardGenerator: CardGenerator
	readonly #deck: StreamDeck
	readonly #deviceId: string

	#queueOutputId: number
	#queue: ImageWriteQueue | undefined
	#queueLcdStrip: ImageWriteQueue | undefined
	#hasDrawnLcdStrip = false

	#companionSupportsScaling = false

	public get deviceId(): string {
		return this.#deviceId
	}
	public get productName(): string {
		return `Satellite StreamDeck: ${this.#deck.MODEL}`
	}

	public constructor(deviceId: string, deck: StreamDeck, cardGenerator: CardGenerator) {
		this.#deck = deck
		this.#deviceId = deviceId
		this.#cardGenerator = cardGenerator

		this.#queueOutputId = 0

		if (this.#deck.ICON_SIZE !== 0) {
			this.#queue = new ImageWriteQueue(async (key: number, buffer: Buffer) => {
				const outputId = this.#queueOutputId

				let newbuffer: Buffer = buffer
				if (this.#deck.ICON_SIZE !== 72 && !this.#companionSupportsScaling) {
					// scale if necessary
					try {
						newbuffer = await imageRs.ImageTransformer.fromBuffer(buffer, 72, 72, imageRs.PixelFormat.Rgb)
							.scale(this.#deck.ICON_SIZE, this.#deck.ICON_SIZE)
							.toBuffer(imageRs.PixelFormat.Rgb)
					} catch (e) {
						console.log(`device(${deviceId}): scale image failed: ${e}`)
						return
					}
				}

				// Check if generated image is still valid
				if (this.#queueOutputId === outputId) {
					try {
						await this.#deck.fillKeyBuffer(key, newbuffer)
					} catch (e_1) {
						console.error(`device(${deviceId}): fillImage failed: ${e_1}`)
					}
				}
			})
		}

		if (this.#deck.LCD_ENCODER_SIZE) {
			const encoderSize = this.#deck.LCD_ENCODER_SIZE
			const xPad = 25
			const xProgression = 216.666
			this.#queueLcdStrip = new ImageWriteQueue(async (key: number, buffer: Buffer) => {
				const outputId = this.#queueOutputId

				let newbuffer: Buffer
				// scale if necessary
				try {
					const inputRes = this.#companionSupportsScaling ? this.#deck.ICON_SIZE : 72
					newbuffer = await imageRs.ImageTransformer.fromBuffer(
						buffer,
						inputRes,
						inputRes,
						imageRs.PixelFormat.Rgb,
					)
						.scale(encoderSize.height, encoderSize.height)
						.toBuffer(imageRs.PixelFormat.Rgb)
				} catch (e) {
					console.log(`device(${deviceId}): scale image failed: ${e}`)
					return
				}

				// Check if generated image is still valid
				if (this.#queueOutputId === outputId) {
					this.#hasDrawnLcdStrip = true

					try {
						await this.#deck.fillLcdRegion(key * xProgression + xPad, 0, newbuffer, {
							format: 'rgb',
							width: encoderSize.height,
							height: encoderSize.height,
						})
					} catch (e_1) {
						console.error(`device(${deviceId}): fillImage failed: ${e_1}`)
					}
				}
			})
		}
	}

	getRegisterProps(): DeviceRegisterProps {
		const info = {
			keysTotal: this.#deck.NUM_KEYS,
			keysPerRow: this.#deck.KEY_COLUMNS,
			bitmapSize: this.#deck.ICON_SIZE,
			colours: false,
			text: false,
		}

		if (this.#deck.MODEL === DeviceModelId.PLUS) {
			info.keysTotal += this.#deck.NUM_ENCODERS * 2
		}

		return info
	}

	async close(): Promise<void> {
		this.#queue?.abort()
		await this.#deck.close()
	}
	async initDevice(client: CompanionClient, status: string): Promise<void> {
		console.log('Registering key events for ' + this.deviceId)
		this.#deck.on('down', (key) => client.keyDown(this.deviceId, key))
		this.#deck.on('up', (key) => client.keyUp(this.deviceId, key))

		if (this.#deck.MODEL === DeviceModelId.PLUS) {
			this.#deck.on('encoderDown', (encoder) => {
				const index = this.#deck.NUM_KEYS + this.#deck.NUM_ENCODERS + encoder
				client.keyDown(this.deviceId, index)
			})
			this.#deck.on('encoderUp', (encoder) => {
				const index = this.#deck.NUM_KEYS + this.#deck.NUM_ENCODERS + encoder
				client.keyUp(this.deviceId, index)
			})
			this.#deck.on('rotateLeft', (encoder) => {
				const index = this.#deck.NUM_KEYS + this.#deck.NUM_ENCODERS + encoder
				client.rotateLeft(this.deviceId, index)
			})
			this.#deck.on('rotateRight', (encoder) => {
				const index = this.#deck.NUM_KEYS + this.#deck.NUM_ENCODERS + encoder
				client.rotateRight(this.deviceId, index)
			})

			this.#deck.on('lcdShortPress', (encoder) => {
				const index = this.#deck.NUM_KEYS + encoder

				client.keyDown(this.deviceId, index)

				setTimeout(() => {
					client.keyUp(this.deviceId, index)
				}, 20)
			})
			this.#deck.on('lcdLongPress', (encoder) => {
				const index = this.#deck.NUM_KEYS + encoder

				client.keyDown(this.deviceId, index)

				setTimeout(() => {
					client.keyUp(this.deviceId, index)
				}, 20)
			})
		}

		// Start with blanking it
		await this.blankDevice()

		this.showStatus(client.host, status)
	}

	updateCapabilities(capabilities: ClientCapabilities): void {
		this.#companionSupportsScaling = capabilities.useCustomBitmapResolution
	}

	async deviceAdded(): Promise<void> {
		this.#queueOutputId++
	}
	async setBrightness(percent: number): Promise<void> {
		await this.#deck.setBrightness(percent)
	}
	async blankDevice(): Promise<void> {
		await this.#deck.clearPanel()
	}
	async draw(d: DeviceDrawProps): Promise<void> {
		if (this.#deck.ICON_SIZE !== 0) {
			if (d.image) {
				if (d.keyIndex < this.#deck.NUM_KEYS) {
					if (this.#queue) {
						this.#queue.queue(d.keyIndex, d.image)
					} else {
						await this.#deck.fillKeyBuffer(d.keyIndex, d.image)
					}
				} else if (this.#deck.MODEL === DeviceModelId.PLUS && d.keyIndex < this.#deck.NUM_KEYS + 4) {
					const index = d.keyIndex - this.#deck.NUM_KEYS
					this.#queueLcdStrip?.queue(index, d.image)
				}
			} else {
				throw new Error(`Cannot draw for Streamdeck without image`)
			}
		}
	}
	showStatus(hostname: string, status: string): void {
		if (this.#deck.ICON_SIZE !== 0) {
			// abort and discard current operations
			this.#queue?.abort()
			this.#queueOutputId++

			const outputId = this.#queueOutputId
			const width = this.#deck.ICON_SIZE * this.#deck.KEY_COLUMNS
			const height = this.#deck.ICON_SIZE * this.#deck.KEY_ROWS
			this.#cardGenerator
				.generateBasicCard(width, height, imageRs.PixelFormat.Rgba, hostname, status)
				.then(async (buffer) => {
					if (outputId === this.#queueOutputId) {
						if (this.#hasDrawnLcdStrip) {
							// Blank everything first, to ensure the strip is cleared
							this.#hasDrawnLcdStrip = false
							await this.#deck.clearPanel()
						}

						// still valid
						await this.#deck.fillPanelBuffer(buffer, {
							format: 'rgba',
						})
					}
				})
				.catch((e) => {
					console.error(`Failed to fill device`, e)
				})
		}
	}
}
