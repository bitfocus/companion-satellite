import { ImageTransformer, PixelFormat } from '@julusian/image-rs'
import type { CardGenerator } from './cards.js'
import type { CompanionClientInner, SurfaceId, SurfacePincodeMapPageEntry, WrappedSurface } from './device-types/api.js'
import type { ClientCapabilities, CompanionClient, DeviceDrawProps, DeviceRegisterProps } from './device-types/api.js'
import { DrawingState } from './drawingState.js'

export class SurfaceProxy {
	readonly #cardGenerator: CardGenerator
	readonly #surface: WrappedSurface
	readonly #registerProps: DeviceRegisterProps

	readonly #drawQueue = new DrawingState<number | string>('preinit')

	#isLocked = false
	#lockButtonPage = 0
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

	constructor(cardGenerator: CardGenerator, surface: WrappedSurface, registerProps: DeviceRegisterProps) {
		this.#cardGenerator = cardGenerator
		this.#surface = surface
		this.#registerProps = registerProps
	}

	async close(): Promise<void> {
		this.#drawQueue.abortQueued('closed')

		return this.#surface.close()
	}

	#keyIndexToXY(keyIndex: number): [number, number] {
		const { columnCount } = this.#registerProps

		const x = keyIndex % columnCount
		const y = Math.floor(keyIndex / columnCount)

		return [x, y]
	}

	async initDevice(client: CompanionClient, status: string): Promise<void> {
		// Ensure it doesn't get stuck as locked
		this.#isLocked = false

		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const self = this

		const clientWrapper: CompanionClientInner = {
			get isLocked(): boolean {
				return self.#isLocked
			},

			keyDown: (keyIndex: number): void => {
				const xy = this.#keyIndexToXY(keyIndex)

				if (this.#isLocked) {
					this.#pincodeXYPress(client, ...xy)
					return
				}

				// TODO - test this
				client.keyDownXY(this.surfaceId, ...xy)
			},
			keyUp: (keyIndex: number): void => {
				if (this.#isLocked) return

				const xy = this.#keyIndexToXY(keyIndex)
				client.keyUpXY(this.surfaceId, ...xy)
			},
			keyDownUp: (keyIndex: number): void => {
				const xy = this.#keyIndexToXY(keyIndex)

				if (this.#isLocked) {
					this.#pincodeXYPress(client, ...xy)
					return
				}

				client.keyDownXY(this.surfaceId, ...xy)

				setTimeout(() => {
					if (!this.#isLocked) {
						client.keyUpXY(this.surfaceId, ...xy)
					}
				}, 20)
			},
			rotateLeft: (keyIndex: number): void => {
				if (this.#isLocked) return

				const xy = this.#keyIndexToXY(keyIndex)
				client.rotateLeftXY(this.surfaceId, ...xy)
			},
			rotateRight: (keyIndex: number): void => {
				if (this.#isLocked) return

				const xy = this.#keyIndexToXY(keyIndex)
				client.rotateRightXY(this.surfaceId, ...xy)
			},

			keyDownXY: (x: number, y: number): void => {
				// TODO - mirror to the non-XY version
				if (this.#isLocked) {
					this.#pincodeXYPress(client, x, y)
					return
				}

				client.keyDownXY(this.surfaceId, x, y)
			},
			keyUpXY: (x: number, y: number): void => {
				if (this.#isLocked) return

				client.keyUpXY(this.surfaceId, x, y)
			},
			keyDownUpXY: (x: number, y: number): void => {
				if (this.#isLocked) {
					this.#pincodeXYPress(client, x, y)
					return
				}

				client.keyDownXY(this.surfaceId, x, y)

				setTimeout(() => {
					if (!this.#isLocked) {
						client.keyUpXY(this.surfaceId, x, y)
					}
				}, 20)
			},
			rotateLeftXY: (x: number, y: number): void => {
				if (this.#isLocked) return

				client.rotateLeftXY(this.surfaceId, x, y)
			},
			rotateRightXY: (x: number, y: number): void => {
				if (this.#isLocked) return

				client.rotateRightXY(this.surfaceId, x, y)
			},

			sendVariableValue: (variable: string, value: any): void => {
				if (this.#isLocked) return

				client.sendVariableValue(this.surfaceId, variable, value)
			},
		}

		await this.#surface.initDevice(clientWrapper)

		this.showStatus(client.displayHost, status)
	}

	#pincodeXYPress(client: CompanionClient, x: number, y: number): void {
		const pincodeMap = this.#surface.pincodeMap
		if (!pincodeMap) return

		const equals = (xy: [number, number]) => x === xy[0] && y === xy[1]

		if (pincodeMap.type === 'multiple-page' && equals(pincodeMap.nextPage)) {
			this.#lockButtonPage = (this.#lockButtonPage + 1) % pincodeMap.pages.length
			this.#drawPincodePage()
			return
		}

		const pageInfo = pincodeMap.type === 'single-page' ? pincodeMap : pincodeMap.pages[this.#lockButtonPage]
		if (!pageInfo) return

		const index = Object.entries(pageInfo).find(([, v]) => equals(v))?.[0]
		if (!index) return

		const indexNumber = Number(index)
		if (isNaN(indexNumber)) return

		client.pincodeKey(this.surfaceId, indexNumber)
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

	async draw(data: DeviceDrawProps): Promise<void> {
		if (this.#isLocked) return

		if (this.#drawQueue.state !== 'draw') {
			// Abort any other draws and blank the device
			this.#drawQueue.abortQueued('draw', async () => this.#surface.blankDevice())
		}

		this.#drawQueue.queueJob(data.keyIndex, async (_key, signal) => {
			if (signal.aborted) return

			return this.#surface.draw(signal, data)
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
		const wasLocked = this.#isLocked
		this.#isLocked = locked
		this.#lockButtonPage = 0
		this.#pincodeCharacterCount = characterCount

		if (!wasLocked) {
			// Always discard the previous draw
			this.#drawQueue.abortQueued('locked-pending-draw', async () => this.#surface.blankDevice())
		}

		if (!this.#surface.pincodeMap) {
			console.warn(`Pincode layout not supported not supported: ${this.surfaceId}`)
			return
		}

		if (!wasLocked) {
			this.#drawPincodePage()
		} else {
			this.#drawPincodeStatus()
		}

		if (this.#surface.onLockedStatus) {
			this.#surface.onLockedStatus(locked, characterCount)
		}
	}

	#drawPincodePage() {
		if (!this.#isLocked) return

		// TODO - this needs to clear any buttons which were drawn before and aren't now

		this.#drawPincodeStatus()

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

		if (this.#surface.pincodeMap?.type === 'multiple-page') {
			const xy = this.#surface.pincodeMap.nextPage
			this.#drawPincodeButton(
				xy,
				(width, height) => Buffer.from(this.#cardGenerator.generatePincodeChar(width, height, '+')),
				'#ffffff',
				'+',
			)
		}
	}

	#drawPincodeStatus() {
		const pincodeXy = this.#surface.pincodeMap?.pincode
		if (!pincodeXy) return

		this.#drawPincodeButton(
			pincodeXy,
			(width, height) =>
				Buffer.from(this.#cardGenerator.generatePincodeValue(width, height, this.#pincodeCharacterCount)),
			'#ffffff',
			'*'.repeat(this.#pincodeCharacterCount),
		)
	}

	#drawPincodeNumber(key: keyof SurfacePincodeMapPageEntry) {
		const pincodeMap = this.#surface.pincodeMap
		if (!pincodeMap) return

		let pageInfo: SurfacePincodeMapPageEntry

		if (pincodeMap.type === 'single-page') {
			pageInfo = pincodeMap
		} else {
			if (this.#lockButtonPage >= pincodeMap.pages.length) {
				this.#lockButtonPage = 0
			}
			pageInfo = pincodeMap.pages[this.#lockButtonPage] as SurfacePincodeMapPageEntry
		}

		const xy = pageInfo?.[key]
		if (!xy) return

		this.#drawPincodeButton(
			xy,
			(width, height) => Buffer.from(this.#cardGenerator.generatePincodeChar(width, height, key)),
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
		let keyBuffer: Buffer | undefined
		if (this.registerProps.bitmapSize) {
			const render = bitmapFn(this.registerProps.bitmapSize, this.registerProps.bitmapSize)

			// TODO - this is a hack to get the image to draw correctly
			keyBuffer = ImageTransformer.fromBuffer(
				Buffer.from(render),
				this.registerProps.bitmapSize,
				this.registerProps.bitmapSize,
				PixelFormat.Rgba,
			).toBufferSync(PixelFormat.Rgb).buffer
		}

		const keyIndex = xy[0] + xy[1] * this.registerProps.columnCount
		this.#drawQueue.queueJob(keyIndex, async (key, signal) => {
			if (signal.aborted) return

			await this.#surface.draw(signal, {
				deviceId: this.surfaceId,
				keyIndex: keyIndex,
				image: keyBuffer,
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
			await this.#surface.showStatus(signal, this.#cardGenerator, hostname, status)
		})
	}
}
