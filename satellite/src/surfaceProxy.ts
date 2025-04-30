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

			keyDown: (deviceId: string, keyIndex: number): void => {
				if (this.#isLocked) return

				// TODO - test this
				const xy = this.#keyIndexToXY(keyIndex)
				client.keyDownXY(deviceId, ...xy)
			},
			keyUp: (deviceId: string, keyIndex: number): void => {
				if (this.#isLocked) return

				const xy = this.#keyIndexToXY(keyIndex)
				client.keyUpXY(deviceId, ...xy)
			},
			rotateLeft: (deviceId: string, keyIndex: number): void => {
				if (this.#isLocked) return

				const xy = this.#keyIndexToXY(keyIndex)
				client.rotateLeftXY(deviceId, ...xy)
			},
			rotateRight: (deviceId: string, keyIndex: number): void => {
				if (this.#isLocked) return

				const xy = this.#keyIndexToXY(keyIndex)
				client.rotateRightXY(deviceId, ...xy)
			},

			keyDownXY: (deviceId: string, x: number, y: number): void => {
				// TODO - mirror to the non-XY version
				if (this.#isLocked) {
					// TODO - properly
					client.pincodeKey(deviceId, x)
				} else {
					client.keyDownXY(deviceId, x, y)
				}
			},
			keyUpXY: (deviceId: string, x: number, y: number): void => {
				if (this.#isLocked) return

				client.keyUpXY(deviceId, x, y)
			},
			rotateLeftXY: (deviceId: string, x: number, y: number): void => {
				if (this.#isLocked) return

				client.rotateLeftXY(deviceId, x, y)
			},
			rotateRightXY: (deviceId: string, x: number, y: number): void => {
				if (this.#isLocked) return

				client.rotateRightXY(deviceId, x, y)
			},

			sendVariableValue: (deviceId: string, variable: string, value: any): void => {
				if (this.#isLocked) return

				client.sendVariableValue(deviceId, variable, value)
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
