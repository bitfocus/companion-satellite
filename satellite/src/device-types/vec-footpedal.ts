import type {
	ClientCapabilities,
	SurfaceContext,
	DeviceDrawProps,
	DeviceRegisterProps,
	DiscoveredSurfaceInfo,
	HIDDevice,
	OpenSurfaceResult,
	SurfacePlugin,
	SurfaceInstance,
} from './api.js'
import type { CardGenerator } from '../graphics/cards.js'
import crypto from 'node:crypto'
import vecFootpedal, { VecFootpedalDeviceInfo } from 'vec-footpedal'

const PLUGIN_ID = 'vec-footpedal'

export class VecFootpedalPlugin implements SurfacePlugin<HIDDevice> {
	readonly pluginId = PLUGIN_ID
	readonly pluginName = 'VEC Footpedal'
	readonly pluginComment = []

	async init(): Promise<void> {
		// Nothing to do
	}
	async destroy(): Promise<void> {
		// Nothing to do
	}

	checkSupportsHidDevice = (device: HIDDevice): DiscoveredSurfaceInfo<HIDDevice> | null => {
		// VEC Footpedal vendorId is 0x16c0 and productId is 0x05e1
		const isVecFootpedal = device.vendorId === 0x16c0 && device.productId === 0x05e1
		if (!isVecFootpedal) return null

		if (!device || !device.path) return null

		// The devices don't have serial numbers, so fake something based on the path
		const fakeDeviceId = crypto.createHash('sha1').update(`${device.productId}-${device.path}`).digest('hex')

		return {
			surfaceId: `vecfootpedal:${fakeDeviceId}`,
			description: device.product ?? 'VEC Footpedal',
			pluginInfo: device,
		}
	}

	openSurface = async (
		surfaceId: string,
		pluginInfo: HIDDevice,
		context: SurfaceContext,
	): Promise<OpenSurfaceResult> => {
		if (!pluginInfo.path) throw new Error('No path provided')

		// Initialize the footpedal
		const pedal = vecFootpedal
		// We're doing device search via Satellite so don't run it here too
		// nocommit - this is flawed and needs the library to be fixed beore this is safe
		pedal.start(false)
		pedal.connect(pluginInfo.path)

		const deviceInfo = pedal.getDeviceByPath(pluginInfo.path)
		if (!deviceInfo) throw new Error('Device not found!')

		const registerProps = compileRegisterProps()

		return {
			surface: new VecFootpedalWrapper(surfaceId, pedal, context, registerProps, deviceInfo),
			registerProps,
		}
	}
}

function compileRegisterProps(): DeviceRegisterProps {
	return {
		brightness: false,
		rowCount: 1,
		columnCount: 3,
		bitmapSize: 0,
		colours: false,
		text: false,
		pincodeMap: { type: 'custom' }, // Don't want to attempt pincode
	}
}

export class VecFootpedalWrapper implements SurfaceInstance {
	readonly pluginId = PLUGIN_ID

	readonly #pedal: typeof vecFootpedal
	readonly #surfaceId: string
	readonly #deviceInfo: VecFootpedalDeviceInfo

	public get surfaceId(): string {
		return this.#surfaceId
	}
	public get productName(): string {
		return `VEC ${this.#deviceInfo.name}`
	}

	public constructor(
		surfaceId: string,
		pedal: typeof vecFootpedal,
		context: SurfaceContext,
		_registerProps: DeviceRegisterProps,
		deviceInfo: VecFootpedalDeviceInfo,
	) {
		this.#pedal = pedal
		this.#surfaceId = surfaceId
		this.#deviceInfo = deviceInfo

		this.#pedal.on('error', (e) => context.disconnect(e))

		this.#pedal.on('buttondown', (info) => {
			context.keyDown(info - 1)
		})

		this.#pedal.on('buttonup', (info) => {
			context.keyUp(info - 1)
		})

		this.#pedal.on('disconnected', () => {
			context.disconnect(new Error('Device disconnected'))
		})
	}

	async close(): Promise<void> {
		this.#pedal.stop()
	}
	async initDevice(): Promise<void> {
		// Nothing to do
	}

	updateCapabilities(_capabilities: ClientCapabilities): void {
		// Unused
	}

	async deviceAdded(): Promise<void> {
		// Unused
	}
	async setBrightness(_percent: number): Promise<void> {
		// Not supported
	}
	async blankDevice(): Promise<void> {
		// Not supported
	}
	async draw(_signal: AbortSignal, _d: DeviceDrawProps): Promise<void> {
		// Not supported
	}

	async showStatus(
		_signal: AbortSignal,
		_cardGenerator: CardGenerator,
		_hostname: string,
		_status: string,
	): Promise<void> {
		// Nothing to display here
	}
}
