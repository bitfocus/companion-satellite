import type HID from 'node-hid'
import type { CardGenerator } from '../cards.js'
import EventEmitter from 'events'

export type HIDDevice = HID.Device

export type SurfaceId = string

export interface DeviceDrawProps {
	deviceId: string
	keyIndex: number
	image?: Buffer
	color?: string // hex
	text?: string
}
export interface DeviceRegisterProps {
	brightness: boolean
	keysTotal: number
	keysPerRow: number
	bitmapSize: number | null
	colours: boolean
	text: boolean
	transferVariables?: Array<DeviceRegisterInputVariable | DeviceRegisterOutputVariable>
	pincodeMode: boolean
}

export interface DeviceRegisterInputVariable {
	id: string
	type: 'input'
	name: string
	description?: string
}
export interface DeviceRegisterOutputVariable {
	id: string
	type: 'output'
	name: string
	description?: string
}

export interface DiscoveredSurfaceInfo<T> {
	surfaceId: string
	description: string
	pluginInfo: T
}

export interface SurfacePluginDetectionEvents<TInfo> {
	deviceAdded: [device: DiscoveredSurfaceInfo<TInfo>]
	deviceRemoved: [deviceId: SurfaceId]
}

/**
 * For some plugins which only support using a builtin detection mechanism, this can be used to provide the detection info
 */
export interface SurfacePluginDetection<TInfo> extends EventEmitter<SurfacePluginDetectionEvents<TInfo>> {
	/**
	 * Trigger this plugin to perform a scan for any connected surfaces.
	 * This is used when the user triggers a scan, so should refresh any caches when possible
	 */
	triggerScan(): Promise<void>
}

/**
 * The base SurfacePlugin interface, for all surface plugins
 */
export interface SurfacePlugin<TInfo> {
	readonly pluginId: string
	readonly pluginName: string
	readonly pluginComment?: string[]

	/**
	 * Some plugins are forced to use a builtin detection mechanism by their surfaces or inner library
	 * In this case, this property should be set to an instance of SurfacePluginDetection
	 *
	 * It is preferred that plugins to NOT use this, and to instead use the abtractions we provide to reduce the cost of scanning and detection
	 */
	readonly detection?: SurfacePluginDetection<TInfo>

	/**
	 * Initialize the plugin
	 */
	init(): Promise<void>

	/**
	 * Uninitialise the plugin
	 */
	destroy(): Promise<void>

	/**
	 * Check if a HID device is supported by this plugin
	 * Note: This must not open the device, just perform checks based on the provided info to see if it is supported
	 * @param device HID device to check
	 * @returns Info about the device if it is supported, otherwise null
	 */
	checkSupportsHidDevice?: (device: HIDDevice) => DiscoveredSurfaceInfo<TInfo> | null

	/**
	 * Perform a scan for devices, but not open them
	 * Note: This should only be used if the plugin uses a protocol where we don't have other handling for
	 */
	scanForSurfaces?: () => Promise<DiscoveredSurfaceInfo<TInfo>[]>

	/**
	 * Open a discovered/known surface
	 * @param surfaceId Id of the surface
	 * @param pluginInfo Plugin specific info about the surface
	 * @param cardGenerator Generator for creating status cards
	 * @returns Instance of the surface
	 */
	openSurface: (surfaceId: string, pluginInfo: TInfo, cardGenerator: CardGenerator) => Promise<OpenSurfaceResult>
}

export interface OpenSurfaceResult {
	surface: WrappedSurface
	registerProps: DeviceRegisterProps
}

export interface WrappedSurfaceEvents {
	error: [error: any]
}

export type SurfacePincodeMap = SurfacePincodeMapPageSingle // | SurfacePincodeMapPageEntry[]
export interface SurfacePincodeMapPageSingle {
	pincode: [number, number]
	0: [number, number]
	1: [number, number]
	2: [number, number]
	3: [number, number]
	4: [number, number]
	5: [number, number]
	6: [number, number]
	7: [number, number]
	8: [number, number]
	9: [number, number]
}
export interface SurfacePincodeMapPageEntry {
	pageChange: [number, number]
	pincode: [number, number]
	0: [number, number] | null
	1: [number, number] | null
	2: [number, number] | null
	3: [number, number] | null
	4: [number, number] | null
	5: [number, number] | null
	6: [number, number] | null
	7: [number, number] | null
	8: [number, number] | null
	9: [number, number] | null
}

export interface WrappedSurface extends EventEmitter<WrappedSurfaceEvents> {
	readonly pluginId: string

	readonly surfaceId: SurfaceId
	readonly productName: string

	readonly pincodeMap?: SurfacePincodeMap

	// getRegisterProps(): DeviceRegisterProps

	close(): Promise<void>

	initDevice(client: CompanionClientInner): Promise<void>

	updateCapabilities(capabilities: ClientCapabilities): void

	deviceAdded(): Promise<void>

	setBrightness(percent: number): Promise<void>

	blankDevice(): Promise<void>

	draw(signal: AbortSignal, data: DeviceDrawProps): Promise<void>

	onVariableValue?(name: string, value: string): void

	onLockedStatus?(locked: boolean, characterCount: number): void

	showStatus(signal: AbortSignal, hostname: string, status: string): Promise<void>
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientCapabilities {
	// For future use to support new functionality
}

export interface CompanionClient {
	get displayHost(): string

	keyDownXY(deviceId: string, x: number, y: number): void
	keyUpXY(deviceId: string, x: number, y: number): void
	rotateLeftXY(deviceId: string, x: number, y: number): void
	rotateRightXY(deviceId: string, x: number, y: number): void
	pincodeKey(deviceId: string, keyCode: number): void

	sendVariableValue(deviceId: string, variable: string, value: any): void
}

export interface CompanionClientInner {
	get isLocked(): boolean
	// get displayHost(): string

	keyDown(keyIndex: number): void
	keyUp(keyIndex: number): void
	keyDownUp(keyIndex: number): void
	rotateLeft(keyIndex: number): void
	rotateRight(keyIndex: number): void

	keyDownXY(x: number, y: number): void
	keyUpXY(x: number, y: number): void
	keyDownUpXY(x: number, y: number): void
	rotateLeftXY(x: number, y: number): void
	rotateRightXY(x: number, y: number): void

	sendVariableValue(variable: string, value: any): void
}
