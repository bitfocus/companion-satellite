export type DeviceId = string

export interface DeviceDrawProps {
	deviceId: string
	keyIndex: number
	image?: Buffer
	color?: string // hex
	text?: string
}
export interface DeviceRegisterProps {
	keysTotal: number
	keysPerRow: number
	bitmapSize: number | null
	colours: boolean
	text: boolean
}

export interface WrappedDevice {
	readonly deviceId: DeviceId
	readonly productName: string

	getRegisterProps(): DeviceRegisterProps

	close(): Promise<void>

	initDevice(client: CompanionClient, status: string): Promise<void>

	updateCapabilities(capabilities: ClientCapabilities): void

	deviceAdded(): Promise<void>

	setBrightness(percent: number): Promise<void>

	blankDevice(): Promise<void>

	draw(data: DeviceDrawProps): Promise<void>

	showStatus(hostname: string, status: string): void
}

export interface ClientCapabilities {
	/**
	 * Until 2.4 of Companion it does not support rotary encoders.
	 * For these, we can 'simulate' them by use the press/release actions of a button.
	 */
	readonly useCombinedEncoders: boolean

	/**
	 * Until 3.x of Companion it only supports providing 72x72px bitmaps for buttons.
	 */
	readonly useCustomBitmapResolution: boolean
}

export interface CompanionClient {
	get host(): string

	keyDown(deviceId: string, keyIndex: number): void
	keyUp(deviceId: string, keyIndex: number): void

	rotateLeft(deviceId: string, keyIndex: number): void
	rotateRight(deviceId: string, keyIndex: number): void
}
