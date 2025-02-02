import { LoupedeckDevice, LoupedeckDisplayId, LoupedeckBufferFormat, LoupedeckModelId } from '@loupedeck/node'
import * as imageRs from '@julusian/image-rs'
import { CardGenerator } from '../cards.js'
import { ImageWriteQueue } from '../writeQueue.js'
import {
	ClientCapabilities,
	CompanionClient,
	DeviceDrawProps,
	DeviceRegisterProps,
	WrappedSurface,
	WrappedSurfaceEvents,
} from './api.js'
import { EventEmitter } from 'events'
import { LOUPEDECK_PLUGIN_ID } from './loupedeck-plugin.js'

export class RazerStreamControllerXWrapper extends EventEmitter<WrappedSurfaceEvents> implements WrappedSurface {
	readonly pluginId = LOUPEDECK_PLUGIN_ID

	readonly #cardGenerator: CardGenerator
	readonly #deck: LoupedeckDevice
	readonly #surfaceId: string

	#queueOutputId: number
	#isShowingCard = true
	#queue: ImageWriteQueue

	#companionSupportsScaling = false

	public get surfaceId(): string {
		return this.#surfaceId
	}
	public get productName(): string {
		return this.#deck.modelName
	}

	public constructor(surfaceId: string, device: LoupedeckDevice, cardGenerator: CardGenerator) {
		super()

		this.#deck = device
		this.#surfaceId = surfaceId
		this.#cardGenerator = cardGenerator

		this.#deck.on('error', (e) => this.emit('error', e))

		if (device.modelId !== LoupedeckModelId.RazerStreamControllerX)
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
					newbuffer = (
						await imageRs.ImageTransformer.fromBuffer(buffer, 72, 72, imageRs.PixelFormat.Rgb)
							.scale(width, height)
							.toBuffer(imageRs.PixelFormat.Rgb)
					).buffer
				} catch (e) {
					console.log(`device(${surfaceId}): scale image failed: ${e}`)
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
					console.error(`device(${surfaceId}): fillImage failed: ${e_1}`)
				}
			}
		})
	}

	getRegisterProps(): DeviceRegisterProps {
		return {
			brightness: true,
			keysTotal: 15,
			keysPerRow: 5,
			bitmapSize: this.#deck.lcdKeySize,
			colours: true,
			text: false,
		}
	}

	async close(): Promise<void> {
		this.#queue?.abort()

		await this.#deck.blankDevice(true, true).catch(() => null)

		await this.#deck.close()
	}
	async initDevice(client: CompanionClient, status: string): Promise<void> {
		const convertButtonId = (type: 'button' | 'rotary', id: number): number => {
			if (type === 'button') {
				return id
			}

			// Discard
			return 99
		}
		console.log('Registering key events for ' + this.surfaceId)
		this.#deck.on('down', (info) => client.keyDown(this.surfaceId, convertButtonId(info.type, info.index)))
		this.#deck.on('up', (info) => client.keyUp(this.surfaceId, convertButtonId(info.type, info.index)))

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
		await this.#deck.setBrightness(percent / 100)
	}
	async blankDevice(skipButtons?: boolean): Promise<void> {
		await this.#deck.blankDevice(true, !skipButtons)
	}
	async draw(d: DeviceDrawProps): Promise<void> {
		if (d.image) {
			this.#queue.queue(d.keyIndex, d.image)
		} else {
			throw new Error(`Cannot draw for Loupedeck without image`)
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
