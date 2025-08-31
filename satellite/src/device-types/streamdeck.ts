import {
	DeviceModelId,
	getStreamDeckDeviceInfo,
	openStreamDeck,
	StreamDeck,
	StreamDeckDeviceInfo,
	StreamDeckLcdSegmentControlDefinition,
} from '@elgato-stream-deck/node'
import * as imageRs from '@julusian/image-rs'
import type { CardGenerator } from '../graphics/cards.js'
import {
	ClientCapabilities,
	DeviceDrawProps,
	SurfacePlugin,
	DeviceRegisterProps,
	DiscoveredSurfaceInfo,
	SurfaceInstance,
	HIDDevice,
	SurfaceContext,
	OpenSurfaceResult,
	SurfacePincodeMap,
} from './api.js'
import { parseColor } from './lib.js'
import util from 'util'
import { assertNever } from '../lib.js'
import { Pincode4x4, Pincode5x3, Pincode6x2 } from './pincode.js'

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
		brightness: deck.MODEL !== DeviceModelId.PEDAL,
		rowCount: rows,
		columnCount: cols,
		bitmapSize: needsBitmaps,
		colours: true,
		text: false,
		pincodeMap: generatePincodeMap(deck.MODEL),
	}
}

const PLUGIN_ID = 'elgato-streamdeck'

export class StreamDeckPlugin implements SurfacePlugin<StreamDeckDeviceInfo> {
	readonly pluginId = PLUGIN_ID
	readonly pluginName = 'Elgato Stream Deck'

	async init(): Promise<void> {
		// Nothing to do
	}
	async destroy(): Promise<void> {
		// Nothing to do
	}

	checkSupportsHidDevice = (device: HIDDevice): DiscoveredSurfaceInfo<StreamDeckDeviceInfo> | null => {
		const sdInfo = getStreamDeckDeviceInfo(device)
		if (!sdInfo || !sdInfo.serialNumber) return null

		return {
			surfaceId: `streamdeck:${sdInfo.serialNumber}`,
			description: sdInfo.model, // TODO: Better description
			pluginInfo: sdInfo,
		}
	}

	openSurface = async (
		surfaceId: string,
		pluginInfo: StreamDeckDeviceInfo,
		context: SurfaceContext,
	): Promise<OpenSurfaceResult> => {
		const streamdeck = await openStreamDeck(pluginInfo.path, {
			jpegOptions: {
				quality: 95,
				subsampling: 1, // 422
			},
		})
		const registerProps = compileRegisterProps(streamdeck)
		return {
			surface: new StreamDeckWrapper(surfaceId, streamdeck, registerProps, context),
			registerProps: registerProps,
		}
	}
}

function generatePincodeMap(model: DeviceModelId): SurfacePincodeMap | null {
	switch (model) {
		case DeviceModelId.MINI:
		case DeviceModelId.MODULE6:
			return {
				type: 'multiple-page',
				pincode: [0, 0],
				nextPage: [0, 1],
				pages: [
					{
						1: [1, 1],
						2: [2, 1],
						3: [1, 0],
						4: [2, 0],
					},
					{
						5: [1, 1],
						6: [2, 1],
						7: [1, 0],
						8: [2, 0],
					},
					{
						9: [1, 1],
						0: [2, 1],
						// 7: [1, 0],
						// 8: [2, 0],
					},
				],
			}
		case DeviceModelId.ORIGINAL:
		case DeviceModelId.ORIGINALV2:
		case DeviceModelId.ORIGINALMK2:
		case DeviceModelId.ORIGINALMK2SCISSOR:
		case DeviceModelId.MODULE15:
			return Pincode5x3()
		case DeviceModelId.PEDAL:
		case DeviceModelId.NETWORK_DOCK:
			// Not suitable for a pincode
			return { type: 'custom' }
		case DeviceModelId.NEO:
			return {
				type: 'single-page',
				pincode: [1, 2],
				0: [3, 2],
				1: [0, 0],
				2: [1, 0],
				3: [2, 0],
				4: [3, 0],
				5: [0, 1],
				6: [1, 1],
				7: [2, 1],
				8: [3, 1],
				9: [0, 2],
			}
		case DeviceModelId.PLUS:
			return {
				type: 'single-page',
				pincode: [0, 2],
				0: [3, 2],
				1: [0, 0],
				2: [1, 0],
				3: [2, 0],
				4: [3, 0],
				5: [0, 1],
				6: [1, 1],
				7: [2, 1],
				8: [3, 1],
				9: [2, 2],
			}
		case DeviceModelId.STUDIO:
			return Pincode6x2(1)
		case DeviceModelId.XL:
		case DeviceModelId.MODULE32:
			return Pincode4x4(2)
		default:
			assertNever(model)
			return null
	}
}

export class StreamDeckWrapper implements SurfaceInstance {
	readonly pluginId = PLUGIN_ID

	readonly #deck: StreamDeck
	readonly #surfaceId: string
	readonly #registerProps: DeviceRegisterProps
	readonly #context: SurfaceContext

	/**
	 * Whether the LCD has been written to outside the button bounds that needs clearing
	 */
	#fullLcdDirty = true

	public get surfaceId(): string {
		return this.#surfaceId
	}
	public get productName(): string {
		return this.#deck.PRODUCT_NAME
	}

	public constructor(
		surfaceId: string,
		deck: StreamDeck,
		registerProps: DeviceRegisterProps,
		context: SurfaceContext,
	) {
		this.#deck = deck
		this.#surfaceId = surfaceId
		this.#registerProps = registerProps
		this.#context = context

		this.#deck.on('error', (e) => context.disconnect(e as any))

		this.#deck.on('down', (control) => {
			context.keyDownXY(control.column, control.row)
		})
		this.#deck.on('up', (control) => {
			context.keyUpXY(control.column, control.row)
		})
		this.#deck.on('rotate', (control, delta) => {
			if (delta < 0) {
				context.rotateLeftXY(control.column, control.row)
			} else if (delta > 0) {
				context.rotateRightXY(control.column, control.row)
			}
		})
		this.#deck.on('lcdShortPress', (control, position) => {
			if (context.isLocked) return

			const columnOffset = Math.floor((position.x / control.pixelSize.width) * control.columnSpan)
			const column = control.column + columnOffset

			context.keyDownUpXY(column, control.row)
		})
		this.#deck.on('lcdLongPress', (control, position) => {
			if (context.isLocked) return

			const columnOffset = Math.floor((position.x / control.pixelSize.width) * control.columnSpan)
			const column = control.column + columnOffset

			context.keyDownUpXY(column, control.row)
		})
	}

	async close(): Promise<void> {
		await this.#deck.resetToLogo().catch(() => null)

		await this.#deck.close()
	}
	async initDevice(): Promise<void> {
		// Start with blanking it
		await this.blankDevice()
	}

	updateCapabilities(_capabilities: ClientCapabilities): void {
		// Not used
	}

	async deviceAdded(): Promise<void> {}
	async setBrightness(percent: number): Promise<void> {
		await this.#deck.setBrightness(percent)
	}
	async blankDevice(): Promise<void> {
		await this.#deck.clearPanel()
	}
	async draw(signal: AbortSignal, drawProps: DeviceDrawProps): Promise<void> {
		const key = drawProps.keyIndex

		const x = key % this.#registerProps.columnCount
		const y = Math.floor(key / this.#registerProps.columnCount)

		const control = this.#deck.CONTROLS.find((control) => {
			if (control.row !== y) return false

			if (control.column === x) return true

			if (control.type === 'lcd-segment' && x >= control.column && x < control.column + control.columnSpan)
				return true

			return false
		})
		if (!control) return

		if (control.type === 'button') {
			if (control.feedbackType === 'lcd') {
				if (!drawProps.image) {
					console.error(`No image provided for lcd button`)
					return
				}

				let newbuffer: Buffer | undefined
				if (control.pixelSize.width === 0 || control.pixelSize.height === 0) {
					return
				} else {
					try {
						newbuffer = await drawProps.image(control.pixelSize.width, control.pixelSize.height, 'rgb')
					} catch (e: any) {
						console.error(`scale image failed: ${e}\n${e.stack}`)
						return
					}
				}

				const maxAttempts = 3
				for (let attempts = 1; attempts <= maxAttempts; attempts++) {
					try {
						if (signal.aborted) return

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

				if (signal.aborted) return

				this.#deck.fillKeyColor(control.index, color.r, color.g, color.b).catch((e) => {
					console.log(`color failed: ${e}`)
				})
			}
		} else if (control.type === 'lcd-segment') {
			if (!drawProps.image) {
				console.error(`No image provided for lcd-segment`)
				return
			}

			// Clear the lcd segment if needed
			if (this.#fullLcdDirty) {
				if (signal.aborted) return

				this.#fullLcdDirty = false
				await this.#deck.clearLcdSegment(control.id)
			}

			if (this.#context.isLocked) {
				// Special case handling for neo lcd strip
				if (this.#deck.MODEL === DeviceModelId.NEO) {
					const image = await drawProps.image(control.pixelSize.width, control.pixelSize.height, 'rgb')

					await this.#deck.fillLcd(control.id, image, {
						format: 'rgb',
					})
					return
				} else if (this.#deck.MODEL === DeviceModelId.PLUS && x === 0) {
					const width = (control.pixelSize.width / control.columnSpan) * 2
					const image = await drawProps.image(width, control.pixelSize.height, 'rgb')

					await this.#deck.fillLcdRegion(control.id, 0, 0, image, {
						format: 'rgb',
						width: width,
						height: control.pixelSize.height,
					})
					return
				}
			}
			if (control.drawRegions) {
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
					newbuffer = await drawProps.image(targetSize, targetSize, 'rgb')
				} catch (e) {
					console.log(`scale image failed: ${e}`)
					return
				}

				const maxAttempts = 3
				for (let attempts = 1; attempts <= maxAttempts; attempts++) {
					try {
						if (signal.aborted) return

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
			}
		} else if (control.type === 'encoder' && control.hasLed) {
			const color = parseColor(drawProps.color)

			if (signal.aborted) return

			await this.#deck.setEncoderColor(control.index, color.r, color.g, color.b)
		}
	}
	async showStatus(
		signal: AbortSignal,
		cardGenerator: CardGenerator,
		hostname: string,
		status: string,
	): Promise<void> {
		const fillPanelDimensions = this.#deck.calculateFillPanelDimensions()
		const lcdSegments = this.#deck.CONTROLS.filter(
			(c): c is StreamDeckLcdSegmentControlDefinition => c.type === 'lcd-segment',
		)

		const ps: Promise<void>[] = []

		if (fillPanelDimensions) {
			const fillCard =
				lcdSegments.length > 0
					? cardGenerator.generateLogoCard(fillPanelDimensions.width, fillPanelDimensions.height)
					: cardGenerator.generateBasicCard(
							fillPanelDimensions.width,
							fillPanelDimensions.height,
							'rgba',
							hostname,
							status,
						)

			ps.push(
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
					}),
			)

			for (const lcdStrip of lcdSegments) {
				const stripCard = cardGenerator.generateLcdStripCard(
					lcdStrip.pixelSize.width,
					lcdStrip.pixelSize.height,
					'rgba',
					hostname,
					status,
				)
				stripCard.catch(() => null) // Ensure error doesn't go uncaught

				ps.push(
					stripCard
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
						}),
				)
			}
		}

		await Promise.all(ps)
	}
}
