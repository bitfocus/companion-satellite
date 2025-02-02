import {
	BlackmagicController,
	BlackmagicControllerDeviceInfo,
	getBlackmagicControllerDeviceInfo,
	openBlackmagicController,
	BlackmagicControllerTBarControlDefinition,
	BlackmagicControllerSetButtonColorValue,
} from '@blackmagic-controller/node'
import {
	ClientCapabilities,
	CompanionClient,
	DeviceDrawProps,
	DeviceRegisterProps,
	DiscoveredSurfaceInfo,
	HIDDevice,
	SurfacePlugin,
	WrappedSurface,
	WrappedSurfaceEvents,
} from './api.js'
import { parseColor } from './lib.js'
import debounceFn from 'debounce-fn'
import { EventEmitter } from 'events'
import type { CardGenerator } from '../cards.js'

const PLUGIN_ID = 'blackmagic-controller'

export class BlackmagicControllerPlugin implements SurfacePlugin<BlackmagicControllerDeviceInfo> {
	readonly pluginId = PLUGIN_ID
	readonly pluginName = 'Blackmagic Controller'
	readonly pluginComment = [
		'Requires Companion 3.4 or later.',
		'ATEM Software Control must not be running, or it will fight for control of the panel.',
	]

	async init(): Promise<void> {
		// Nothing to do
	}
	async destroy(): Promise<void> {
		// Nothing to do
	}

	checkSupportsHidDevice = (device: HIDDevice): DiscoveredSurfaceInfo<BlackmagicControllerDeviceInfo> | null => {
		const sdInfo = getBlackmagicControllerDeviceInfo(device)
		if (!sdInfo || !sdInfo.serialNumber) return null

		return {
			surfaceId: `blackmagic:${sdInfo.serialNumber}`,
			description: sdInfo.model, // TODO: Better description
			pluginInfo: sdInfo,
		}
	}

	openSurface = async (
		surfaceId: string,
		pluginInfo: BlackmagicControllerDeviceInfo,
		_cardGenerator: CardGenerator,
	): Promise<WrappedSurface> => {
		const controller = await openBlackmagicController(pluginInfo.path)
		return new BlackmagicControllerWrapper(surfaceId, controller)
	}
}

export class BlackmagicControllerWrapper extends EventEmitter<WrappedSurfaceEvents> implements WrappedSurface {
	readonly pluginId = PLUGIN_ID

	readonly #device: BlackmagicController
	readonly #surfaceId: string
	readonly #columnCount: number
	readonly #rowCount: number

	public get surfaceId(): string {
		return this.#surfaceId
	}
	public get productName(): string {
		return `Blackmagic ${this.#device.PRODUCT_NAME}`
	}

	public constructor(surfaceId: string, device: BlackmagicController) {
		super()

		this.#device = device
		this.#surfaceId = surfaceId

		this.#device.on('error', (e) => this.emit('error', e))

		const allRowValues = this.#device.CONTROLS.map((control) => control.row)
		const allColumnValues = this.#device.CONTROLS.map((button) => button.column)

		this.#columnCount = Math.max(...allColumnValues) + 1
		this.#rowCount = Math.max(...allRowValues) + 1
	}

	getRegisterProps(): DeviceRegisterProps {
		const info: DeviceRegisterProps = {
			brightness: false,
			keysTotal: this.#columnCount * this.#rowCount,
			keysPerRow: this.#columnCount,
			bitmapSize: 0,
			colours: true,
			text: false,
			transferVariables: [
				{
					id: 'tbarValueVariable',
					type: 'input',
					name: 'Variable to store T-bar value to',
					description:
						'This produces a value between 0 and 1. You can use an expression to convert it into a different range.',
				},
				{
					id: 'tbarLeds',
					type: 'output',
					name: 'T-bar LED pattern',
					description:
						'Set the pattern of LEDs on the T-bar. Use numbers -16 to 16, positive numbers light up from the bottom, negative from the top.',
				},
				// {
				// 	id: 'batteryLevel',
				// 	type: 'input',
				// 	name: 'Battery percentage',
				// 	description: 'The battery level of the controller, in range 0-1',
				// },
			],
		}

		return info
	}

	async close(): Promise<void> {
		await this.#device.clearPanel().catch(() => null)

		await this.#device.close()
	}
	async initDevice(client: CompanionClient, status: string): Promise<void> {
		console.log('Registering key events for ' + this.surfaceId)
		this.#device.on('down', (control) => {
			client.keyDownXY(this.surfaceId, control.column, control.row)
		})
		this.#device.on('up', (control) => {
			client.keyUpXY(this.surfaceId, control.column, control.row)
		})
		this.#device.on('batteryLevel', (_level) => {
			// client.sendVariableValue(this.#surfaceId, 'batteryLevel', level.toString())
		})
		this.#device.on('tbar', (_control, level) => {
			client.sendVariableValue(this.#surfaceId, 'tbarValueVariable', level.toString())
		})

		// this.#device
		// 	.getBatteryLevel()
		// 	.then((level) => {
		// 		client.sendVariableValue(this.#surfaceId, 'batteryLevel', (level ?? 0).toString())
		// 	})
		// 	.catch((e) => {
		// 		console.error('Failed to report battery level', e)
		// 	})

		// Start with blanking it
		await this.blankDevice()

		this.showStatus(client.host, status)
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

	onVariableValue(name: string, value: string): void {
		if (name === 'tbarLeds') {
			const tbarControl = this.#device.CONTROLS.find(
				(control): control is BlackmagicControllerTBarControlDefinition =>
					control.type === 'tbar' && control.id === 0,
			)
			if (!tbarControl) {
				console.error(`T-bar control not found`)
				return
			}

			const ledValues = new Array(tbarControl.ledSegments).fill(false)
			const fillLedCount = Number(value)
			if (isNaN(fillLedCount)) {
				return // Future: allow patterns
			}

			if (fillLedCount > 0) {
				ledValues.fill(true, Math.max(ledValues.length - fillLedCount, 0))
			} else if (fillLedCount < 0) {
				ledValues.fill(true, 0, Math.min(-fillLedCount, ledValues.length))
			}

			this.#device.setTbarLeds(ledValues).catch((e) => {
				console.error(`write failed: ${e}`)
			})
		} else {
			console.error('Unknown variable', name)
		}
	}

	showStatus(_hostname: string, _status: string): void {
		// Nothing to display here
		// TODO - do some flashing lights to indicate each status?
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
