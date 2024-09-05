import { DeviceModelId, BlackmagicController } from '@blackmagic-controller/node'
import { BlackmagicControllerSetButtonColorValue } from '@blackmagic-controller/core'
import { ClientCapabilities, CompanionClient, DeviceDrawProps, DeviceRegisterProps, WrappedDevice } from './api.js'
import { parseColor } from './lib.js'
import debounceFn from 'debounce-fn'

export class BlackmagicControllerWrapper implements WrappedDevice {
	readonly #device: BlackmagicController
	readonly #deviceId: string
	readonly #columnCount: number
	readonly #rowCount: number

	#queueOutputId: number

	public get deviceId(): string {
		return this.#deviceId
	}
	public get productName(): string {
		return `Satellite Blackmagic ${this.#device.PRODUCT_NAME}`
	}

	public constructor(deviceId: string, device: BlackmagicController) {
		this.#device = device
		this.#deviceId = deviceId

		const allRowValues = this.#device.CONTROLS.map((control) => control.row)
		const allColumnValues = this.#device.CONTROLS.map((button) => button.column)

		this.#columnCount = Math.max(...allColumnValues) + 1
		this.#rowCount = Math.max(...allRowValues) + 1

		this.#queueOutputId = 0
	}

	getRegisterProps(): DeviceRegisterProps {
		const info = {
			keysTotal: this.#columnCount * this.#rowCount,
			keysPerRow: this.#columnCount,
			bitmapSize: 0,
			colours: true,
			text: false,
		}

		return info
	}

	async close(): Promise<void> {
		await this.#device.close()
	}
	async initDevice(client: CompanionClient, status: string): Promise<void> {
		console.log('Registering key events for ' + this.deviceId)
		this.#device.on('down', (control) => {
			client.keyDownXY(this.deviceId, control.column, control.row)
		})
		this.#device.on('up', (control) => {
			client.keyUpXY(this.deviceId, control.column, control.row)
		})
		this.#device.on('batteryLevel', (level) => {
			// TODO
		})
		this.#device.on('tbar', (level) => {
			// TODO
		})

		// Start with blanking it
		await this.blankDevice()

		this.showStatus(client.host, status)
	}

	updateCapabilities(_capabilities: ClientCapabilities): void {
		// Unused
	}

	async deviceAdded(): Promise<void> {
		this.#queueOutputId++
	}
	async setBrightness(percent: number): Promise<void> {
		// Not supported
	}
	async blankDevice(): Promise<void> {
		await this.#device.clearPanel()
	}
	async draw(d: DeviceDrawProps): Promise<void> {
		if (!d.color) d.color = '#000000'

		const x = d.keyIndex % this.#columnCount
		const y = Math.floor(d.keyIndex / this.#columnCount)

		const control = this.#device.CONTROLS.find(
			(control) => control.type === 'button' && control.row === y && control.column === x,
		)
		if (!control) return

		this.#pendingDrawColors[control.id] = d.color

		this.#triggerRedraw()
	}
	showStatus(hostname: string, status: string): void {
		// nocommit: decide what to do here
		// if (this.#deck.ICON_SIZE !== 0) {
		// 	// abort and discard current operations
		// 	this.#queue?.abort()
		// 	this.#queueOutputId++
		// 	const outputId = this.#queueOutputId
		// 	const width = this.#deck.ICON_SIZE * this.#deck.KEY_COLUMNS
		// 	const height = this.#deck.ICON_SIZE * this.#deck.KEY_ROWS
		// 	this.#cardGenerator
		// 		.generateBasicCard(width, height, imageRs.PixelFormat.Rgba, hostname, status)
		// 		.then(async (buffer) => {
		// 			if (outputId === this.#queueOutputId) {
		// 				if (this.#hasDrawnLcdStrip) {
		// 					// Blank everything first, to ensure the strip is cleared
		// 					this.#hasDrawnLcdStrip = false
		// 					await this.#deck.clearPanel()
		// 				}
		// 				// still valid
		// 				await this.#deck.fillPanelBuffer(buffer, {
		// 					format: 'rgba',
		// 				})
		// 			}
		// 		})
		// 		.catch((e) => {
		// 			console.error(`Failed to fill device`, e)
		// 		})
		// }
	}

	/**
	 * Trigger a redraw of this control, if it can be drawn
	 * @access protected
	 */
	#triggerRedraw = debounceFn(
		() => {
			const colors: BlackmagicControllerSetButtonColorValue[] = []

			const threshold = 100 // Use a lower than 50% threshold, to make it more sensitive

			for (const [id, rawColor] of Object.entries(this.#pendingDrawColors)) {
				const color = parseColor(rawColor)
				colors.push({
					keyId: id,
					red: color.r >= threshold,
					green: color.g >= threshold,
					blue: color.b >= threshold,
				})
			}

			if (colors.length === 0) return

			this.#pendingDrawColors = {}
			this.#device.setButtonColors(colors).catch((e) => {
				console.error(`write failed: ${e}`)
			})
		},
		{
			before: false,
			after: true,
			wait: 5,
			maxWait: 20,
		},
	)
	#pendingDrawColors: Record<string, string> = {}
}
