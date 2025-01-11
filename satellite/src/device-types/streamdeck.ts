import { DeviceModelId, StreamDeck, StreamDeckLcdSegmentControlDefinition } from '@elgato-stream-deck/node'
import * as imageRs from '@julusian/image-rs'
import { CardGenerator } from '../cards.js'
import { ImageWriteQueue } from '../writeQueue.js'
import { ClientCapabilities, CompanionClient, DeviceDrawProps, DeviceRegisterProps, WrappedDevice } from './api.js'
import { parseColor, transformButtonImage } from './lib.js'
import util from 'util'

const setTimeoutPromise = util.promisify(setTimeout)

function compileRegisterProps(deck: StreamDeck): DeviceRegisterProps {
	let minX = 0
	let minY = 0
	let maxX = 0
	let maxY = 0

	let needsBitmaps: number | null = null

	for (const control of deck.CONTROLS) {
		minX = Math.min(minX, control.column)
		maxX = Math.max(maxX, control.column + ('columnSpan' in control ? control.columnSpan - 1 : 0))
		minY = Math.min(minY, control.row)
		maxY = Math.max(maxY, control.row + ('rowSpan' in control ? control.rowSpan - 1 : 0))

		if (control.type === 'button' && control.feedbackType === 'lcd') {
			needsBitmaps = Math.max(control.pixelSize.width, control.pixelSize.height, needsBitmaps ?? 0)
		} else if (control.type === 'lcd-segment') {
			// TODO - this should be considered
		}
	}

	const rows = maxY - minY + 1
	const cols = maxX - minX + 1

	return {
		keysTotal: cols * rows,
		keysPerRow: cols,
		bitmapSize: needsBitmaps,
		colours: true,
		text: false,
	}
}

export class StreamDeckWrapper implements WrappedDevice {
	readonly #cardGenerator: CardGenerator
	readonly #deck: StreamDeck
	readonly #deviceId: string
	readonly #registerProps: DeviceRegisterProps

	#drawAbort: AbortController
	#queue: ImageWriteQueue<[abort: AbortSignal, drawProps: DeviceDrawProps]>

	#companionSupportsScaling = false

	/**
	 * Whether the LCD has been written to outside the button bounds that needs clearing
	 */
	#fullLcdDirty = true

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

		this.#drawAbort = new AbortController()

		this.#registerProps = compileRegisterProps(deck)

		this.#queue = new ImageWriteQueue(async (key: number, abort: AbortSignal, drawProps: DeviceDrawProps) => {
			if (abort.aborted) return

			const x = key % this.#registerProps.keysPerRow
			const y = Math.floor(key / this.#registerProps.keysPerRow)

			const control = this.#deck.CONTROLS.find((control) => {
				if (control.row !== y) return false

				if (control.column === x) return true

				if (control.type === 'lcd-segment' && x >= control.column && x < control.column + control.columnSpan)
					return true

				return false
			})
			if (!control) return

			const bufferSize = this.#companionSupportsScaling ? this.#registerProps.bitmapSize : 72

			if (control.type === 'button') {
				if (control.feedbackType === 'lcd') {
					let newbuffer: Buffer | undefined
					if (control.pixelSize.width === 0 || control.pixelSize.height === 0) {
						return
					} else {
						try {
							newbuffer = await transformButtonImage(
								drawProps.image,
								bufferSize,
								bufferSize,
								control.pixelSize.width,
								control.pixelSize.height,
								imageRs.PixelFormat.Rgb,
							)
						} catch (e: any) {
							console.error(`scale image failed: ${e}\n${e.stack}`)
							return
						}
					}

					const maxAttempts = 3
					for (let attempts = 1; attempts <= maxAttempts; attempts++) {
						try {
							if (abort.aborted) return

							await this.#deck.fillKeyBuffer(control.index, newbuffer)
							return
						} catch (e) {
							if (attempts == maxAttempts) {
								console.log(`fillImage failed after ${attempts} attempts: ${e}`)
								return
							}
							await setTimeoutPromise(20)
						}
					}
				} else if (control.feedbackType === 'rgb') {
					const color = parseColor(drawProps.color)

					if (abort.aborted) return

					this.#deck.fillKeyColor(control.index, color.r, color.g, color.b).catch((e) => {
						console.log(`color failed: ${e}`)
					})
				}
			} else if (control.type === 'lcd-segment' && control.drawRegions) {
				const drawColumn = x - control.column

				const columnWidth = control.pixelSize.width / control.columnSpan
				let drawX = drawColumn * columnWidth
				if (this.#deck.MODEL === DeviceModelId.PLUS) {
					// Position aligned with the buttons/encoders
					drawX = drawColumn * 216.666 + 25
				}

				const targetSize = control.pixelSize.height

				let newbuffer: Buffer | undefined
				try {
					newbuffer = await transformButtonImage(
						drawProps.image,
						bufferSize,
						bufferSize,
						targetSize,
						targetSize,
						imageRs.PixelFormat.Rgb,
					)
				} catch (e) {
					console.log(`scale image failed: ${e}`)
					return
				}

				// Clear the lcd segment if needed
				if (this.#fullLcdDirty) {
					if (abort.aborted) return

					this.#fullLcdDirty = false
					await this.#deck.clearLcdSegment(control.id)
				}

				const maxAttempts = 3
				for (let attempts = 1; attempts <= maxAttempts; attempts++) {
					try {
						if (abort.aborted) return

						await this.#deck.fillLcdRegion(control.id, drawX, 0, newbuffer, {
							format: 'rgb',
							width: targetSize,
							height: targetSize,
						})
						return
					} catch (e) {
						if (attempts == maxAttempts) {
							console.error(`fillImage failed after ${attempts}: ${e}`)
							return
						}
						await setTimeoutPromise(20)
					}
				}
			} else if (control.type === 'encoder' && control.hasLed) {
				const color = parseColor(drawProps.color)

				if (abort.aborted) return

				await this.#deck.setEncoderColor(control.index, color.r, color.g, color.b)
			}
		})
	}

	getRegisterProps(): DeviceRegisterProps {
		return this.#registerProps
	}

	async close(): Promise<void> {
		this.#queue?.abort()
		await this.#deck.close()
	}
	async initDevice(client: CompanionClient, status: string): Promise<void> {
		console.log('Registering key events for ' + this.deviceId)
		this.#deck.on('down', (control) => {
			const key = control.column + control.row * this.#registerProps.keysPerRow

			client.keyDown(this.deviceId, key)
		})
		this.#deck.on('up', (control) => {
			const key = control.column + control.row * this.#registerProps.keysPerRow

			client.keyUp(this.deviceId, key)
		})
		this.#deck.on('rotate', (control, delta) => {
			const key = control.column + control.row * this.#registerProps.keysPerRow
			if (delta < 0) {
				client.rotateLeft(this.deviceId, key)
			} else if (delta > 0) {
				client.rotateRight(this.deviceId, key)
			}
		})
		this.#deck.on('lcdShortPress', (control, position) => {
			const columnOffset = Math.floor((position.x / control.pixelSize.width) * control.columnSpan)

			const key = control.column + columnOffset + control.row * this.#registerProps.keysPerRow

			client.keyDown(this.deviceId, key)

			setTimeout(() => {
				client.keyUp(this.deviceId, key)
			}, 20)
		})
		this.#deck.on('lcdLongPress', (control, position) => {
			const columnOffset = Math.floor((position.x / control.pixelSize.width) * control.columnSpan)

			const key = control.column + columnOffset + control.row * this.#registerProps.keysPerRow

			client.keyDown(this.deviceId, key)

			setTimeout(() => {
				client.keyUp(this.deviceId, key)
			}, 20)
		})

		// Start with blanking it
		await this.blankDevice()

		this.showStatus(client.host, status)
	}

	updateCapabilities(capabilities: ClientCapabilities): void {
		this.#companionSupportsScaling = capabilities.useCustomBitmapResolution
	}

	#discardDraws() {
		this.#drawAbort.abort()
		this.#drawAbort = new AbortController()

		this.#queue.abort()
	}

	async deviceAdded(): Promise<void> {
		this.#discardDraws()
	}
	async setBrightness(percent: number): Promise<void> {
		await this.#deck.setBrightness(percent)
	}
	async blankDevice(): Promise<void> {
		this.#discardDraws()

		await this.#deck.clearPanel()
	}
	async draw(drawProps: DeviceDrawProps): Promise<void> {
		this.#queue.queue(drawProps.keyIndex, this.#drawAbort.signal, drawProps)
	}
	showStatus(hostname: string, status: string): void {
		this.#discardDraws()

		const signal = this.#drawAbort.signal

		const fillPanelDimensions = this.#deck.calculateFillPanelDimensions()
		const lcdSegments = this.#deck.CONTROLS.filter(
			(c): c is StreamDeckLcdSegmentControlDefinition => c.type === 'lcd-segment',
		)

		if (fillPanelDimensions) {
			const fillCard =
				lcdSegments.length > 0
					? this.#cardGenerator.generateLogoCard(fillPanelDimensions.width, fillPanelDimensions.height)
					: this.#cardGenerator.generateBasicCard(
							fillPanelDimensions.width,
							fillPanelDimensions.height,
							imageRs.PixelFormat.Rgba,
							hostname,
							status,
						)

			fillCard
				.then(async (buffer) => {
					if (signal.aborted) return

					// still valid
					await this.#deck.fillPanelBuffer(buffer, {
						format: 'rgba',
					})
				})
				.catch((e) => {
					console.error(`Failed to fill device`, e)
				})

			for (const lcdStrip of lcdSegments) {
				this.#cardGenerator
					.generateLcdStripCard(
						lcdStrip.pixelSize.width,
						lcdStrip.pixelSize.height,
						imageRs.PixelFormat.Rgba,
						hostname,
						status,
					)
					.then(async (buffer) => {
						if (signal.aborted) return

						// Mark the screen as dirty, so the gaps get cleared when the first region draw happens
						this.#fullLcdDirty = true

						// still valid
						await this.#deck.fillLcd(lcdStrip.id, buffer, {
							format: 'rgba',
						})
					})
					.catch((e) => {
						console.error(`Failed to fill device`, e)
					})
			}
		}
	}
}
