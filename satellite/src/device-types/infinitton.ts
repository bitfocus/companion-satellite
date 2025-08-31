import type { CardGenerator } from '../graphics/cards.js'
import type {
	DeviceDrawProps,
	SurfacePlugin,
	DiscoveredSurfaceInfo,
	SurfaceInstance,
	HIDDevice,
	OpenSurfaceResult,
	SurfaceContext,
} from './api.js'
import Infinitton from 'infinitton-idisplay'
import { Pincode5x3 } from './pincode.js'
import type { SatelliteSurfaceLayout } from '../generated/SurfaceSchema.js'

export interface InfinittonDeviceInfo {
	path: string
}

const PLUGIN_ID = 'infinitton'

export class InfinittonPlugin implements SurfacePlugin<InfinittonDeviceInfo> {
	readonly pluginId = PLUGIN_ID
	readonly pluginName = 'Infinitton'

	async init(): Promise<void> {
		// Nothing to do
	}
	async destroy(): Promise<void> {
		// Nothing to do
	}

	checkSupportsHidDevice = (device: HIDDevice): DiscoveredSurfaceInfo<InfinittonDeviceInfo> | null => {
		if (
			device.path &&
			device.serialNumber &&
			device.vendorId === Infinitton.VENDOR_ID &&
			Infinitton.PRODUCT_IDS.includes(device.productId)
		) {
			return {
				surfaceId: `infinitton:${device.serialNumber}`,
				description: `Infinitton`,
				pluginInfo: { path: device.path },
			}
		} else {
			return null
		}
	}

	openSurface = async (
		surfaceId: string,
		pluginInfo: InfinittonDeviceInfo,
		context: SurfaceContext,
	): Promise<OpenSurfaceResult> => {
		const infinitton = new Infinitton(pluginInfo.path)

		const surfaceSchema: SatelliteSurfaceLayout = {
			stylePresets: {
				default: {
					bitmap: { w: 72, h: 72 },
				},
			},
			controls: {},
		}

		for (let i = 0; i < Infinitton.NUM_KEYS; i++) {
			const row = Math.floor(i / Infinitton.NUM_KEYS_PER_ROW)
			const column = i % Infinitton.NUM_KEYS_PER_ROW

			surfaceSchema.controls[`${row}/${column}`] = {
				row,
				column,
			}
		}

		return {
			surface: new InfinittonWrapper(surfaceId, infinitton, context),
			registerProps: {
				brightness: true,
				surfaceSchema,
				pincodeMap: Pincode5x3(),
			},
		}
	}
}

export class InfinittonWrapper implements SurfaceInstance {
	readonly pluginId = PLUGIN_ID

	readonly #panel: Infinitton
	readonly #surfaceId: string

	public get surfaceId(): string {
		return this.#surfaceId
	}
	public get productName(): string {
		return `Infinitton`
	}

	public constructor(surfaceId: string, panel: Infinitton, context: SurfaceContext) {
		this.#panel = panel
		this.#surfaceId = surfaceId

		this.#panel.on('error', (e) => context.disconnect(e))

		this.#panel.on('down', (key: number) => context.keyDownById(key + ''))
		this.#panel.on('up', (key: number) => context.keyUpById(key + ''))
	}

	async close(): Promise<void> {
		this.#panel.close()
	}
	async initDevice(): Promise<void> {
		// Start with blanking it
		await this.blankDevice()
	}

	async deviceAdded(): Promise<void> {}
	async setBrightness(percent: number): Promise<void> {
		this.#panel.setBrightness(percent)
	}
	async blankDevice(): Promise<void> {
		this.#panel.clearAllKeys()
	}
	async draw(_signal: AbortSignal, d: DeviceDrawProps): Promise<void> {
		if (d.image) {
			const buffer = await d.image(72, 72, 'rgb')
			this.#panel.fillImage(d.keyIndex, buffer)
		} else {
			throw new Error(`Cannot draw for Streamdeck without image`)
		}
	}
	async showStatus(
		signal: AbortSignal,
		cardGenerator: CardGenerator,
		hostname: string,
		status: string,
	): Promise<void> {
		const width = Infinitton.ICON_SIZE * Infinitton.NUM_KEYS_PER_ROW
		const height = Infinitton.ICON_SIZE * Math.floor(Infinitton.NUM_KEYS / Infinitton.NUM_KEYS_PER_ROW)
		const buffer = await cardGenerator.generateBasicCard(width, height, 'rgb', hostname, status)

		if (signal.aborted) return

		// still valid
		this.#panel.fillPanelImage(buffer)
	}
}
