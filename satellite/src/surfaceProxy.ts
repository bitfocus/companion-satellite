import { ImageTransformer, PixelFormat } from '@julusian/image-rs'
import type { CardGenerator } from './cards.js'
import type {
	CompanionClientInner,
	SurfaceId,
	SurfacePincodeMapPageSingle,
	WrappedSurface,
} from './device-types/api.js'
import type { ClientCapabilities, CompanionClient, DeviceDrawProps, DeviceRegisterProps } from './device-types/api.js'
import { DrawingState } from './drawingState.js'

export class SurfaceProxy {
	readonly #cardGenerator: CardGenerator
	readonly #surface: WrappedSurface
	readonly #registerProps: DeviceRegisterProps

	readonly #drawQueue = new DrawingState<number | string>('preinit')

	#isLocked = false

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
		const { keysPerRow } = this.#registerProps

		const x = keyIndex % keysPerRow
		const y = Math.floor(keyIndex / keysPerRow)

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
				if (this.#isLocked) return

				// TODO - test this
				const xy = this.#keyIndexToXY(keyIndex)
				client.keyDownXY(this.surfaceId, ...xy)
			},
			keyUp: (keyIndex: number): void => {
				if (this.#isLocked) return

				const xy = this.#keyIndexToXY(keyIndex)
				client.keyUpXY(this.surfaceId, ...xy)
			},
			keyDownUp: (keyIndex: number): void => {
				if (this.#isLocked) return

				const xy = this.#keyIndexToXY(keyIndex)

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
					// TODO - properly
					client.pincodeKey(this.surfaceId, x)
				} else {
					client.keyDownXY(this.surfaceId, x, y)
				}
			},
			keyUpXY: (x: number, y: number): void => {
				if (this.#isLocked) return

				client.keyUpXY(this.surfaceId, x, y)
			},
			keyDownUpXY: (x: number, y: number): void => {
				if (this.#isLocked) return

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

		if (!wasLocked) {
			// Always discard the previous draw
			this.#drawQueue.abortQueued('locked-pending-draw')
		}

		if (!this.#surface.pincodeMap) {
			console.warn(`Pincode layout not supported not supported: ${this.surfaceId}`)
			return
		}

		if (!wasLocked) {
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
		}

		const pincodeXy = this.#surface.pincodeMap.pincode
		if (pincodeXy) {
			let entryBuffer: Buffer | undefined
			if (this.registerProps.bitmapSize) {
				const entryRender = this.#cardGenerator.generatePincodeValue(
					this.registerProps.bitmapSize,
					this.registerProps.bitmapSize,
					characterCount,
				)

				// TODO - this is a hack to get the image to draw correctly
				entryBuffer = ImageTransformer.fromBuffer(
					Buffer.from(entryRender),
					this.registerProps.bitmapSize,
					this.registerProps.bitmapSize,
					PixelFormat.Rgba,
				).toBufferSync(PixelFormat.Rgb).buffer
			}

			const keyIndex = pincodeXy[0] + pincodeXy[1] * this.registerProps.keysPerRow
			this.#drawQueue.queueJob(keyIndex, async (key, signal) => {
				if (signal.aborted) return
				await this.#surface.draw(signal, {
					deviceId: this.surfaceId,
					keyIndex: keyIndex,
					image: entryBuffer,
					color: '#ffffff',
					text: '*'.repeat(characterCount),
				})
			})
		}

		if (this.#surface.onLockedStatus) {
			this.#surface.onLockedStatus(locked, characterCount)
		}
	}

	#drawPincodeNumber(key: keyof SurfacePincodeMapPageSingle) {
		const xy = this.#surface.pincodeMap?.[key]
		if (!xy) return

		let keyBuffer: Buffer | undefined
		if (this.registerProps.bitmapSize) {
			const render = this.#cardGenerator.generatePincodeNumber(
				this.registerProps.bitmapSize,
				this.registerProps.bitmapSize,
				Number(key),
			)

			// TODO - this is a hack to get the image to draw correctly
			keyBuffer = ImageTransformer.fromBuffer(
				Buffer.from(render),
				this.registerProps.bitmapSize,
				this.registerProps.bitmapSize,
				PixelFormat.Rgba,
			).toBufferSync(PixelFormat.Rgb).buffer
		}

		const keyIndex = xy[0] + xy[1] * this.registerProps.keysPerRow
		this.#drawQueue.queueJob(keyIndex, async (key, signal) => {
			if (signal.aborted) return
			await this.#surface.draw(signal, {
				deviceId: this.surfaceId,
				keyIndex: keyIndex,
				image: keyBuffer,
				color: '#ffffff',
				text: `${key}`,
			})
		})
	}

	showStatus(hostname: string, status: string): void {
		// Always discard the previous draw
		this.#drawQueue.abortQueued('status')

		this.#drawQueue.queueJob(0, async (_key, signal) => {
			if (signal.aborted) return
			await this.#surface.showStatus(signal, hostname, status)
		})
	}
}
