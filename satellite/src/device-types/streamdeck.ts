import {
	DeviceModelId,
	getStreamDeckDeviceInfo,
	openStreamDeck,
	StreamDeck,
	StreamDeckControlDefinition,
	StreamDeckDeviceInfo,
	StreamDeckLcdSegmentControlDefinition,
} from '@elgato-stream-deck/node'
import type { CardGenerator } from '../graphics/cards.js'
import {
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
import type { SatelliteSurfaceLayout } from '../generated/SurfaceManifestSchema.js'

const setTimeoutPromise = util.promisify(setTimeout)

function getControlId(control: StreamDeckControlDefinition, xOffset = 0): string {
	return `${control.row}/${control.column + xOffset}`
}

function compileRegisterProps(deck: StreamDeck): DeviceRegisterProps {
	const surfaceManifest: SatelliteSurfaceLayout = {
		stylePresets: {
			default: {
				// Ignore default, as it is hard to translate into for our existing layout
			},
			empty: {},
			rgb: { colors: 'hex' },
		},
		controls: {},
	}

	for (const control of deck.CONTROLS) {
		const controlId = getControlId(control)
		switch (control.type) {
			case 'button':
				switch (control.feedbackType) {
					case 'none':
						surfaceManifest.controls[controlId] = {
							row: control.row,
							column: control.column,
							stylePreset: 'empty',
						}
						break
					case 'lcd': {
						const presetId = `btn_${control.pixelSize.width}x${control.pixelSize.height}`
						if (!surfaceManifest.stylePresets[presetId]) {
							surfaceManifest.stylePresets[presetId] = {
								bitmap: {
									w: control.pixelSize.width,
									h: control.pixelSize.height,
								},
							}
						}
						surfaceManifest.controls[controlId] = {
							row: control.row,
							column: control.column,
							stylePreset: presetId,
						}
						break
					}
					case 'rgb':
						surfaceManifest.controls[controlId] = {
							row: control.row,
							column: control.column,
							stylePreset: 'rgb',
						}
						break
					default:
						assertNever(control)
						break
				}
				break
			case 'encoder':
				if (control.hasLed) {
					surfaceManifest.controls[controlId] = {
						row: control.row,
						column: control.column,
						stylePreset: 'rgb',
					}
				} else {
					surfaceManifest.controls[controlId] = {
						row: control.row,
						column: control.column,
						stylePreset: 'empty',
					}
				}
				// Future: LED ring
				break
			case 'lcd-segment': {
				const width = control.pixelSize.width / control.columnSpan
				const presetId = `lcd_${width}x${control.pixelSize.height}`
				if (!surfaceManifest.stylePresets[presetId]) {
					surfaceManifest.stylePresets[presetId] = {
						bitmap: {
							w: width,
							h: control.pixelSize.height,
						},
					}
				}

				for (let i = 0; i < control.columnSpan; i++) {
					const controlId = getControlId(control, i)
					surfaceManifest.controls[controlId] = {
						row: control.row,
						column: control.column + i,
						stylePreset: presetId,
					}
				}
				break
			}
			default:
				assertNever(control)
				break
		}
	}

	return {
		brightness: deck.MODEL !== DeviceModelId.PEDAL,
		surfaceManifest,
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
	// readonly #registerProps: DeviceRegisterProps
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
		_registerProps: DeviceRegisterProps,
		context: SurfaceContext,
	) {
		this.#deck = deck
		this.#surfaceId = surfaceId
		// this.#registerProps = registerProps
		this.#context = context

		this.#deck.on('error', (e) => context.disconnect(e as any))

		this.#deck.on('down', (control) => {
			context.keyDownById(getControlId(control))
		})
		this.#deck.on('up', (control) => {
			context.keyUpById(getControlId(control))
		})
		this.#deck.on('rotate', (control, delta) => {
			if (delta < 0) {
				context.rotateLeftById(getControlId(control))
			} else if (delta > 0) {
				context.rotateRightById(getControlId(control))
			}
		})
		this.#deck.on('lcdShortPress', (control, position) => {
			if (context.isLocked) return

			const columnOffset = Math.floor((position.x / control.pixelSize.width) * control.columnSpan)

			context.keyDownUpById(getControlId(control, columnOffset))
		})
		this.#deck.on('lcdLongPress', (control, position) => {
			if (context.isLocked) return

			const columnOffset = Math.floor((position.x / control.pixelSize.width) * control.columnSpan)

			context.keyDownUpById(getControlId(control, columnOffset))
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

	async deviceAdded(): Promise<void> {}
	async setBrightness(percent: number): Promise<void> {
		await this.#deck.setBrightness(percent)
	}
	async blankDevice(): Promise<void> {
		await this.#deck.clearPanel()
	}
	async draw(signal: AbortSignal, drawProps: DeviceDrawProps): Promise<void> {
		const control = this.#deck.CONTROLS.find((control) => {
			if (control.row !== drawProps.row) return false

			if (control.column === drawProps.column) return true

			if (
				control.type === 'lcd-segment' &&
				drawProps.column >= control.column &&
				drawProps.column < control.column + control.columnSpan
			)
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
				} else if (this.#deck.MODEL === DeviceModelId.PLUS && drawProps.column === 0) {
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
				const drawColumn = drawProps.column - control.column

				const columnWidth = control.pixelSize.width / control.columnSpan
				let drawX = drawColumn * columnWidth

				const targetHeight = control.pixelSize.height
				let targetWidth = targetHeight

				if (this.#context.capabilities.supportsSurfaceManifest) {
					targetWidth = columnWidth
				} else if (this.#deck.MODEL === DeviceModelId.PLUS) {
					// Position aligned with the buttons/encoders
					drawX = drawColumn * 216.666 + 25
				}

				let newbuffer: Buffer | undefined
				try {
					newbuffer = await drawProps.image(targetWidth, targetHeight, 'rgb')
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
							width: targetWidth,
							height: targetHeight,
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
