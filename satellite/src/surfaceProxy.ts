import type { SurfaceGraphicsContext } from './graphics/lib.js'
import type {
	DeviceDrawImageFn,
	SurfaceContext,
	SurfaceId,
	SurfacePincodeMapPageEntry,
	SurfaceInstance,
	SurfacePincodeMap,
} from './device-types/api.js'
import type { ClientCapabilities, CompanionClient, DeviceRegisterProps } from './device-types/api.js'
import { DrawingState } from './graphics/drawingState.js'
import { calculateGridSize, transformButtonImage } from './device-types/lib.js'
import {
	SatelliteConfigSize,
	SatelliteControlDefinition,
	SatelliteControlStylePreset,
} from './generated/SurfaceSchema.js'

export interface SurfaceProxyDrawProps {
	deviceId: string
	keyIndex: number
	image?: Buffer
	color?: string // hex
	text?: string
}

export interface GridSize {
	rows: number
	columns: number
}

/**
 * A wrapper around a surface to handle pincode locking and other common tasks
 */
export class SurfaceProxy {
	readonly #graphics: SurfaceGraphicsContext
	readonly #context: SurfaceProxyContext
	readonly #surface: SurfaceInstance
	readonly #registerProps: DeviceRegisterProps
	readonly #gridSize: GridSize
	readonly #fallbackBitmapSize: number

	readonly #drawQueue = new DrawingState<number | string>('preinit')

	#pincodeCharacterCount = 0

	get pluginId(): string {
		return this.#surface.pluginId
	}

	get surfaceId(): SurfaceId {
		return this.#surface.surfaceId
	}
	get productName(): string {
		return this.#surface.productName
	}

	get registerProps(): DeviceRegisterProps {
		return this.#registerProps
	}
	get gridSize(): GridSize {
		return this.#gridSize
	}
	get fallbackBitmapSize(): number {
		return this.#fallbackBitmapSize
	}

	constructor(
		graphics: SurfaceGraphicsContext,
		context: SurfaceProxyContext,
		surface: SurfaceInstance,
		registerProps: DeviceRegisterProps,
	) {
		this.#graphics = graphics
		this.#context = context
		this.#surface = surface
		this.#registerProps = registerProps
		this.#gridSize = calculateGridSize(registerProps.surfaceSchema)

		let bitmapSize = registerProps.surfaceSchema.stylePresets.default.bitmap
		if (!bitmapSize) {
			bitmapSize = Object.values(registerProps.surfaceSchema.stylePresets).find((s) => !!s.bitmap)?.bitmap
		}
		this.#fallbackBitmapSize = bitmapSize ? Math.min(bitmapSize.h, bitmapSize.w) : 0

		// Setup the cyclical reference :(
		context.storeSurface(this, registerProps.pincodeMap)
	}

	async close(): Promise<void> {
		this.#drawQueue.abortQueued('closed')

		return this.#surface.close()
	}

	async initDevice(displayHost: string, status: string): Promise<void> {
		// Ensure it doesn't get stuck as locked
		this.#context.setLocked(false)

		console.log('Initialising ' + this.surfaceId)

		await this.#surface.initDevice()

		this.showStatus(displayHost, status)
	}

	updateCapabilities(capabilities: ClientCapabilities): void {
		return this.#surface.updateCapabilities(capabilities)
	}

	async deviceAdded(): Promise<void> {
		this.#drawQueue.abortQueued('reinit')

		return this.#surface.deviceAdded()
	}

	async setBrightness(percent: number): Promise<void> {
		return this.#surface.setBrightness(percent)
	}

	blankDevice(): void {
		if (this.#drawQueue.state === 'blank') return

		this.#drawQueue.abortQueued('blank')
		this.#drawQueue.queueJob(0, async (_key, signal) => {
			if (signal.aborted) return
			await this.#surface.blankDevice()
		})
	}

	async draw(data: SurfaceProxyDrawProps): Promise<void> {
		if (this.#context.isLocked) return

		if (this.#drawQueue.state !== 'draw') {
			// Abort any other draws and blank the device
			this.#drawQueue.abortQueued('draw', async () => this.#surface.blankDevice())
		}

		this.#drawQueue.queueJob(data.keyIndex, async (_key, signal) => {
			if (signal.aborted) return

			let controlInfo: [string, SatelliteControlDefinition] | null = null
			for (const [id, control] of Object.entries(this.#registerProps.surfaceSchema.controls)) {
				if (control.row === xy[1] && control.column === xy[0]) {
					controlInfo = [id, control]
					break
				}
			}

			// Missing the control for some reason.. Probably using the old api.
			if (!controlInfo) return

			const bitmapSize: SatelliteConfigSize | undefined = this.#context.supportsSchema
				? this.#getStyleForPreset(controlInfo[1].stylePreset).bitmap
				: {
						w: this.#fallbackBitmapSize,
						h: this.#fallbackBitmapSize,
					}

			const rawImage = data.image
			const image: DeviceDrawImageFn | undefined =
				bitmapSize && rawImage
					? async (targetWidth, targetHeight, targetPixelFormat) =>
							transformButtonImage(
								{
									width: bitmapSize.w,
									height: bitmapSize.h,
									buffer: rawImage,
									pixelFormat: 'rgb',
								},
								targetWidth,
								targetHeight,
								targetPixelFormat,
							)
					: undefined

			return this.#surface.draw(signal, {
				...data,
				image,
			})
		})
	}

	onVariableValue(name: string, value: string): void {
		if (this.#surface.onVariableValue) {
			this.#surface.onVariableValue(name, value)
		} else {
			console.warn(`Variable value not supported: ${this.surfaceId}`)
		}
	}

	onLockedStatus(locked: boolean, characterCount: number): void {
		const wasLocked = this.#context.isLocked
		this.#context.setLocked(locked)
		this.#pincodeCharacterCount = characterCount

		if (!wasLocked) {
			// Always discard the previous draw
			this.#drawQueue.abortQueued('locked-pending-draw', async () => this.#surface.blankDevice())
		}

		if (!this.#context.pincodeMap) {
			console.warn(`Pincode layout not supported not supported: ${this.surfaceId}`)
			return
		}

		if (!wasLocked) {
			this.drawPincodePage()
		} else {
			this.#drawPincodeStatus()
		}

		if (this.#surface.onLockedStatus) {
			this.#surface.onLockedStatus(locked, characterCount)
		}
	}

	#lastPincodePageDraw = new Map<string, [number, number]>()
	drawPincodePage(): void {
		if (!this.#context.isLocked) return

		this.#drawPincodeStatus()

		const previousDraw = this.#lastPincodePageDraw
		this.#lastPincodePageDraw = new Map<string, [number, number]>()

		// Draw the number buttons and other details
		this.#drawPincodeNumber(0)
		this.#drawPincodeNumber(1)
		this.#drawPincodeNumber(2)
		this.#drawPincodeNumber(3)
		this.#drawPincodeNumber(4)
		this.#drawPincodeNumber(5)
		this.#drawPincodeNumber(6)
		this.#drawPincodeNumber(7)
		this.#drawPincodeNumber(8)
		this.#drawPincodeNumber(9)

		// Clear any buttons which weren't drawn this time
		for (const [id, xy] of previousDraw) {
			if (this.#lastPincodePageDraw.has(id)) continue

			this.#drawPincodeButton(xy, (width, height) => Buffer.alloc(width * height * 4, 0), '#000000', '')
		}

		if (this.#context.pincodeMap?.type === 'multiple-page') {
			const xy = this.#context.pincodeMap.nextPage
			this.#drawPincodeButton(
				xy,
				(width, height) => Buffer.from(this.#graphics.locking.generatePincodeChar(width, height, '+')),
				'#ffffff',
				'+',
			)
		}
	}

	#drawPincodeStatus() {
		if (!this.#context.pincodeMap || this.#context.pincodeMap.type === 'custom') return
		const pincodeXy = this.#context.pincodeMap.pincode
		if (!pincodeXy) return

		this.#drawPincodeButton(
			pincodeXy,
			(width, height) =>
				Buffer.from(this.#graphics.locking.generatePincodeValue(width, height, this.#pincodeCharacterCount)),
			'#ffffff',
			'*'.repeat(this.#pincodeCharacterCount),
		)
	}

	#drawPincodeNumber(key: keyof SurfacePincodeMapPageEntry) {
		const pincodeMap = this.#context.pincodeMap
		if (!pincodeMap) return

		const xy = this.#context.currentPincodePage?.[key]
		if (!xy) return

		this.#lastPincodePageDraw.set(`${xy[0]}-${xy[1]}`, xy)

		this.#drawPincodeButton(
			xy,
			(width, height) => Buffer.from(this.#graphics.locking.generatePincodeChar(width, height, key)),
			'#ffffff',
			`${key}`,
		)
	}

	#drawPincodeButton(
		xy: [number, number],
		bitmapFn: (width: number, height: number) => Buffer,
		color: string,
		text: string,
	) {
		let controlInfo: [string, SatelliteControlDefinition] | null = null
		for (const [id, control] of Object.entries(this.#registerProps.surfaceSchema.controls)) {
			if (control.row === xy[1] && control.column === xy[0]) {
				controlInfo = [id, control]
				break
			}
		}

		// Missing the control for some reason.. Probably using the old api.
		if (!controlInfo) return

		const bitmapSize: SatelliteConfigSize | undefined = this.#context.supportsSchema
			? this.#getStyleForPreset(controlInfo[1].stylePreset).bitmap
			: {
					w: this.#fallbackBitmapSize,
					h: this.#fallbackBitmapSize,
				}

		const image: DeviceDrawImageFn | undefined = bitmapSize
			? async (targetWidth, targetHeight, targetPixelFormat) =>
					transformButtonImage(
						{
							width: targetWidth,
							height: targetHeight,
							buffer: bitmapFn(targetWidth, targetHeight),
							pixelFormat: 'rgba',
						},
						targetWidth,
						targetHeight,
						targetPixelFormat,
					)
			: undefined

		const keyIndex = xy[0] + xy[1] * this.#gridSize.columns
		this.#drawQueue.queueJob(keyIndex, async (_key, signal) => {
			if (signal.aborted) return

			await this.#surface.draw(signal, {
				deviceId: this.surfaceId,
				keyIndex,
				controlId: controlInfo[0],
				image,
				color,
				text,
			})
		})
	}

	showStatus(hostname: string, status: string): void {
		// Always discard the previous draw
		this.#drawQueue.abortQueued('status')

		this.#drawQueue.queueJob(0, async (_key, signal) => {
			if (signal.aborted) return
			await this.#surface.showStatus(signal, this.#graphics.cards, hostname, status)
		})
	}

	#getStyleForPreset(stylePreset: string | undefined): SatelliteControlStylePreset {
		return (
			(stylePreset && this.#registerProps.surfaceSchema.stylePresets[stylePreset]) ||
			this.#registerProps.surfaceSchema.stylePresets.default
		)
	}
}

export class SurfaceProxyContext implements SurfaceContext {
	readonly #client: CompanionClient
	readonly #surfaceId: SurfaceId

	readonly disconnect: SurfaceContext['disconnect']

	#surface: SurfaceProxy | null = null
	#pincodeMap: SurfacePincodeMap | null = null

	#isLocked = false
	#lockButtonPage = 0

	get isLocked(): boolean {
		return this.#isLocked
	}

	get pincodeMap(): SurfacePincodeMap | null {
		return this.#pincodeMap
	}

	get currentPincodePage(): SurfacePincodeMapPageEntry | undefined {
		const pincodeMap = this.#pincodeMap
		if (!pincodeMap) return undefined

		if (pincodeMap.type === 'custom') return undefined

		if (pincodeMap.type === 'single-page') return pincodeMap

		if (this.#lockButtonPage >= pincodeMap.pages.length) {
			this.#lockButtonPage = 0
		}
		return pincodeMap.pages[this.#lockButtonPage] as SurfacePincodeMapPageEntry
	}

	get supportsSchema(): boolean {
		return this.#client.displayHost
	}

	constructor(client: CompanionClient, surfaceId: SurfaceId, onDisconnect: SurfaceContext['disconnect']) {
		this.#client = client
		this.#surfaceId = surfaceId

		this.disconnect = onDisconnect
	}

	storeSurface(surfaceProxy: SurfaceProxy, pincodeMap: SurfacePincodeMap | null): void {
		if (this.#surface) throw new Error('Surface already set')
		this.#surface = surfaceProxy
		this.#pincodeMap = pincodeMap
	}

	setLocked(locked: boolean): void {
		if (!this.isLocked && locked) {
			this.#lockButtonPage = 0
		}

		this.#isLocked = locked
	}

	keyDown(keyIndex: number): void {
		const xy = this.#keyIndexToXY(keyIndex)

		if (this.#isLocked) {
			this.#pincodeXYPress(...xy)
			return
		}

		// TODO - test this
		this.#client.keyDownXY(this.#surfaceId, ...xy)
	}
	keyUp(keyIndex: number): void {
		if (this.#isLocked) return

		const xy = this.#keyIndexToXY(keyIndex)
		this.#client.keyUpXY(this.#surfaceId, ...xy)
	}
	keyDownUp(keyIndex: number): void {
		const xy = this.#keyIndexToXY(keyIndex)

		if (this.#isLocked) {
			this.#pincodeXYPress(...xy)
			return
		}

		this.#client.keyDownXY(this.#surfaceId, ...xy)

		setTimeout(() => {
			if (!this.#isLocked) {
				this.#client.keyUpXY(this.#surfaceId, ...xy)
			}
		}, 20)
	}
	rotateLeft(keyIndex: number): void {
		if (this.#isLocked) return

		const xy = this.#keyIndexToXY(keyIndex)
		this.#client.rotateLeftXY(this.#surfaceId, ...xy)
	}
	rotateRight(keyIndex: number): void {
		if (this.#isLocked) return

		const xy = this.#keyIndexToXY(keyIndex)
		this.#client.rotateRightXY(this.#surfaceId, ...xy)
	}

	keyDownXY(x: number, y: number): void {
		// TODO - mirror to the non-XY version
		if (this.#isLocked) {
			this.#pincodeXYPress(x, y)
			return
		}

		this.#client.keyDownXY(this.#surfaceId, x, y)
	}
	keyUpXY(x: number, y: number): void {
		if (this.#isLocked) return

		this.#client.keyUpXY(this.#surfaceId, x, y)
	}
	keyDownUpXY(x: number, y: number): void {
		if (this.#isLocked) {
			this.#pincodeXYPress(x, y)
			return
		}

		this.#client.keyDownXY(this.#surfaceId, x, y)

		setTimeout(() => {
			if (!this.#isLocked) {
				this.#client.keyUpXY(this.#surfaceId, x, y)
			}
		}, 20)
	}
	rotateLeftXY(x: number, y: number): void {
		if (this.#isLocked) return

		this.#client.rotateLeftXY(this.#surfaceId, x, y)
	}
	rotateRightXY(x: number, y: number): void {
		if (this.#isLocked) return

		this.#client.rotateRightXY(this.#surfaceId, x, y)
	}

	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
	sendVariableValue(variable: string, value: any): void {
		if (this.#isLocked) return

		this.#client.sendVariableValue(this.#surfaceId, variable, value)
	}

	#keyIndexToXY(keyIndex: number): [number, number] {
		if (!this.#surface) throw new Error('Surface not set')

		const { columns } = this.#surface.gridSize

		const x = keyIndex % columns
		const y = Math.floor(keyIndex / columns)

		return [x, y]
	}

	#pincodeXYPress(x: number, y: number): void {
		const pincodeMap = this.#pincodeMap
		if (!pincodeMap) return

		if (pincodeMap.type === 'custom') return

		const equals = (xy: [number, number]) => x === xy[0] && y === xy[1]

		if (pincodeMap.type === 'multiple-page' && equals(pincodeMap.nextPage)) {
			this.#lockButtonPage = (this.#lockButtonPage + 1) % pincodeMap.pages.length
			this.#surface?.drawPincodePage()
			return
		}

		const pageInfo = pincodeMap.type === 'single-page' ? pincodeMap : pincodeMap.pages[this.#lockButtonPage]
		if (!pageInfo) return

		const index = Object.entries(pageInfo).find(([, v]) => equals(v))?.[0]
		if (!index) return

		const indexNumber = Number(index)
		if (isNaN(indexNumber)) return

		this.#client.pincodeKey(this.#surfaceId, indexNumber)
	}
}
