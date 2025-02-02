import type HID from 'node-hid'
import type { CardGenerator } from '../cards.js'
import EventEmitter from 'events'

export type HIDDevice = HID.Device

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

export interface DiscoveredSurfaceInfo<T> {
	surfaceId: string
	// description: string
	pluginInfo: T
}

export interface SurfacePluginDetectionEvents<TInfo> {
	deviceAdded: [device: DiscoveredSurfaceInfo<TInfo>]
	deviceRemoved: [deviceId: DeviceId]
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
	openSurface: (surfaceId: string, pluginInfo: TInfo, cardGenerator: CardGenerator) => Promise<WrappedSurface>
}

export interface WrappedSurfaceEvents {
	error: [error: any]
}

export interface WrappedSurface extends EventEmitter<WrappedSurfaceEvents> {
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
	 * Until 3.2 of Companion it only supports providing 72x72px bitmaps for buttons.
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
