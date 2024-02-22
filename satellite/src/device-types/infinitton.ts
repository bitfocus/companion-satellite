import { CardGenerator } from '../cards'
import { ClientCapabilities, CompanionClient, DeviceDrawProps, DeviceRegisterProps, WrappedDevice } from './api'
import Infinitton = require('infinitton-idisplay')
import * as imageRs from '@julusian/image-rs'

export class InfinittonWrapper implements WrappedDevice {
	readonly #cardGenerator: CardGenerator
	readonly #panel: Infinitton
	readonly #deviceId: string

	#currentStatus: string | null = null

	public get deviceId(): string {
		return this.#deviceId
	}
	public get productName(): string {
		return `Satellite Infinitton`
	}

	public constructor(deviceId: string, panel: Infinitton, cardGenerator: CardGenerator) {
		this.#panel = panel
		this.#deviceId = deviceId
		this.#cardGenerator = cardGenerator
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
		console.log('Registering key events for ' + this.deviceId)
		this.#panel.on('down', (key: number) => client.keyDown(this.deviceId, key))
		this.#panel.on('up', (key: number) => client.keyUp(this.deviceId, key))

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
