import { StreamDeck } from '@elgato-stream-deck/node'
import sharp from 'sharp'
import { CompanionSatelliteClient } from '../client.js'
import { CardGenerator } from '../cards.js'
import { ImageWriteQueue } from '../writeQueue.js'
import { DeviceDrawProps, DeviceRegisterProps, WrappedDevice } from './api.js'

export class StreamDeckWrapper implements WrappedDevice {
	readonly #cardGenerator: CardGenerator
	readonly #deck: StreamDeck
	readonly #deviceId: string

	#queueOutputId: number
	#queue: ImageWriteQueue | undefined

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

		if (this.#deck.ICON_SIZE !== 72 && this.#deck.ICON_SIZE !== 0) {
			this.#queue = new ImageWriteQueue(async (key: number, buffer: Buffer) => {
				const outputId = this.#queueOutputId
				let newbuffer: Buffer | null = null
				try {
					newbuffer = await sharp(buffer, { raw: { width: 72, height: 72, channels: 3 } })
						.resize(this.#deck.ICON_SIZE, this.#deck.ICON_SIZE)
						.raw()
						.toBuffer()
				} catch (e) {
					console.error(`device(${deviceId}): scale image failed: ${e}`)
					return
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
	}

	getRegisterProps(): DeviceRegisterProps {
		return {
			keysTotal: this.#deck.NUM_KEYS,
			keysPerRow: this.#deck.KEY_COLUMNS,
			bitmaps: this.#deck.ICON_SIZE !== 0,
			colours: false,
			text: false,
		}
	}

	async close(): Promise<void> {
		this.#queue?.abort()
		this.#deck.close()
	}
	async initDevice(client: CompanionSatelliteClient, status: string): Promise<void> {
		console.log('Registering key events for ' + this.deviceId)
		this.#deck.on('down', (key) => client.keyDown(this.deviceId, key))
		this.#deck.on('up', (key) => client.keyUp(this.deviceId, key))

		// Start with blanking it
		await this.blankDevice()

		await this.showStatus(client.host, status)
	}

	async deviceAdded(): Promise<void> {
		this.#queueOutputId++
	}
	async setBrightness(percent: number): Promise<void> {
		this.#deck.setBrightness(percent)
	}
	async blankDevice(): Promise<void> {
		await this.#deck.clearPanel()
	}
	async draw(d: DeviceDrawProps): Promise<void> {
		if (this.#deck.ICON_SIZE !== 0) {
			if (d.image) {
				if (this.#queue) {
					this.#queue.queue(d.keyIndex, d.image)
				} else {
					await this.#deck.fillKeyBuffer(d.keyIndex, d.image)
				}
			} else {
				throw new Error(`Cannot draw for Streamdeck without image`)
			}
		}
	}
	async showStatus(hostname: string, status: string): Promise<void> {
		if (this.#deck.ICON_SIZE !== 0) {
			// abort and discard current operations
			this.#queue?.abort()
			this.#queueOutputId++

			const outputId = this.#queueOutputId
			const width = this.#deck.ICON_SIZE * this.#deck.KEY_COLUMNS
			const height = this.#deck.ICON_SIZE * this.#deck.KEY_ROWS
			this.#cardGenerator
				.generateBasicCard(width, height, hostname, status)
				.then(async (buffer) => {
					if (outputId === this.#queueOutputId) {
						// still valid
						await this.#deck.fillPanelBuffer(buffer, { format: 'rgba' })
					}
				})
				.catch((e) => {
					console.error(`Failed to fill device`, e)
				})
		}
	}
}
