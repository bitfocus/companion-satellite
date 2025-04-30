import type { CompanionClientInner, SurfaceId, WrappedSurface } from './device-types/api.js'
import type { ClientCapabilities, CompanionClient, DeviceDrawProps, DeviceRegisterProps } from './device-types/api.js'

export class SurfaceProxy {
	readonly #surface: WrappedSurface
	readonly #registerProps: DeviceRegisterProps

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

	constructor(surface: WrappedSurface, registerProps: DeviceRegisterProps) {
		this.#surface = surface
		this.#registerProps = registerProps
	}

	async close(): Promise<void> {
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
			get displayHost() {
				return client.displayHost
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

		return this.#surface.initDevice(clientWrapper, status)
	}

	updateCapabilities(capabilities: ClientCapabilities): void {
		return this.#surface.updateCapabilities(capabilities)
	}

	async deviceAdded(): Promise<void> {
		return this.#surface.deviceAdded()
	}

	async setBrightness(percent: number): Promise<void> {
		return this.#surface.setBrightness(percent)
	}

	async blankDevice(): Promise<void> {
		return this.#surface.blankDevice()
	}

	async draw(data: DeviceDrawProps): Promise<void> {
		if (this.#isLocked) return

		return this.#surface.draw(data)
	}

	onVariableValue(name: string, value: string): void {
		if (this.#surface.onVariableValue) {
			this.#surface.onVariableValue(name, value)
		} else {
			console.warn(`Variable value not supported: ${this.surfaceId}`)
		}
	}

	onLockedStatus(locked: boolean, characterCount: number): void {
		this.#isLocked = locked

		if (this.#surface.onLockedStatus) {
			this.#surface.onLockedStatus(locked, characterCount)
		} else if (locked) {
			console.error(`Locked status not supported: ${this.surfaceId}`)
		} else {
			console.warn(`Lock status not supported: ${this.surfaceId}`)
		}
	}

	showStatus(hostname: string, status: string): void {
		this.#surface.showStatus(hostname, status)
	}
}
