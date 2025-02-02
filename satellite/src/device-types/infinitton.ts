import { CardGenerator } from '../cards.js'
import {
	ClientCapabilities,
	CompanionClient,
	DeviceDrawProps,
	SurfacePlugin,
	DeviceRegisterProps,
	DiscoveredSurfaceInfo,
	WrappedSurface,
	WrappedSurfaceEvents,
	HIDDevice,
} from './api.js'
import * as imageRs from '@julusian/image-rs'
import Infinitton from 'infinitton-idisplay'
import { EventEmitter } from 'events'

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
				surfaceId: device.serialNumber,
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
		cardGenerator: CardGenerator,
	): Promise<WrappedSurface> => {
		const infinitton = new Infinitton(pluginInfo.path)
		return new InfinittonWrapper(surfaceId, infinitton, cardGenerator)
	}
}

export class InfinittonWrapper extends EventEmitter<WrappedSurfaceEvents> implements WrappedSurface {
	readonly pluginId = PLUGIN_ID

	readonly #cardGenerator: CardGenerator
	readonly #panel: Infinitton
	readonly #deviceId: string

	#currentStatus: string | null = null

	public get surfaceId(): string {
		return this.#deviceId
	}
	public get productName(): string {
		return `Satellite Infinitton`
	}

	public constructor(deviceId: string, panel: Infinitton, cardGenerator: CardGenerator) {
		super()

		this.#panel = panel
		this.#deviceId = deviceId
		this.#cardGenerator = cardGenerator

		this.#panel.on('error', (e) => this.emit('error', e))
	}

	getRegisterProps(): DeviceRegisterProps {
		return {
			keysTotal: 15,
			keysPerRow: 5,
			bitmapSize: 72,
			colours: false,
			text: false,
		}
	}

	async close(): Promise<void> {
		this.#panel.close()
	}
	async initDevice(client: CompanionClient, status: string): Promise<void> {
		console.log('Registering key events for ' + this.surfaceId)
		this.#panel.on('down', (key: number) => client.keyDown(this.surfaceId, key))
		this.#panel.on('up', (key: number) => client.keyUp(this.surfaceId, key))

		// Start with blanking it
		await this.blankDevice()

		this.showStatus(client.host, status)
	}

	updateCapabilities(_capabilities: ClientCapabilities): void {
		// Nothing to do
	}

	async deviceAdded(): Promise<void> {
		this.#currentStatus = null
	}
	async setBrightness(percent: number): Promise<void> {
		this.#panel.setBrightness(percent)
	}
	async blankDevice(): Promise<void> {
		this.#panel.clearAllKeys()
	}
	async draw(d: DeviceDrawProps): Promise<void> {
		if (d.image) {
			this.#panel.fillImage(d.keyIndex, d.image)
		} else {
			throw new Error(`Cannot draw for Streamdeck without image`)
		}
	}
	showStatus(hostname: string, status: string): void {
		this.#currentStatus = status

		const width = Infinitton.ICON_SIZE * Infinitton.NUM_KEYS_PER_ROW
		const height = Infinitton.ICON_SIZE * Math.floor(Infinitton.NUM_KEYS / Infinitton.NUM_KEYS_PER_ROW)
		this.#cardGenerator
			.generateBasicCard(width, height, imageRs.PixelFormat.Rgb, hostname, status)
			.then(async (buffer) => {
				if (status === this.#currentStatus) {
					// still valid
					this.#panel.fillPanelImage(buffer)
				}
			})
			.catch((e) => {
				console.error(`Failed to fill device`, e)
			})
	}
}
