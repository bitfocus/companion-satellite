import {
	BlackmagicController,
	BlackmagicControllerDeviceInfo,
	getBlackmagicControllerDeviceInfo,
	openBlackmagicController,
	BlackmagicControllerTBarControlDefinition,
	BlackmagicControllerControlDefinition,
	DeviceModelId,
	BlackmagicControllerSetButtonSomeValue,
	BlackmagicControllerButtonControlDefinition,
} from '@blackmagic-controller/node'
import type {
	SurfaceContext,
	DeviceDrawProps,
	DeviceRegisterProps,
	DiscoveredSurfaceInfo,
	HIDDevice,
	OpenSurfaceResult,
	SurfacePlugin,
	SurfaceInstance,
	SurfacePincodeMap,
} from './api.js'
import { parseColor } from './lib.js'
import debounceFn from 'debounce-fn'
import type { CardGenerator } from '../graphics/cards.js'
import { assertNever } from '../lib.js'
import type { SatelliteSurfaceLayout } from '../generated/SurfaceManifestSchema.js'

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
		context: SurfaceContext,
	): Promise<OpenSurfaceResult> => {
		const controller = await openBlackmagicController(pluginInfo.path)

		const registerProps = compileRegisterProps(controller)

		return {
			surface: new BlackmagicControllerWrapper(surfaceId, controller, context, registerProps),
			registerProps,
		}
	}
}

function compileRegisterProps(controller: BlackmagicController): DeviceRegisterProps {
	const surfaceManifest: SatelliteSurfaceLayout = {
		stylePresets: {
			default: {
				colors: 'hex',
			},
		},
		controls: {},
	}

	for (const control of controller.CONTROLS) {
		surfaceManifest.controls[`${control.row}/${control.column}`] = {
			row: control.row,
			column: control.column,
		}
	}

	const info: DeviceRegisterProps = {
		brightness: false,
		surfaceManifest,
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
		pincodeMap: generatePincodeMap(controller.MODEL, controller.CONTROLS),
	}

	return info
}

function generatePincodeMap(
	model: DeviceModelId,
	controls: Readonly<BlackmagicControllerControlDefinition[]>,
): SurfacePincodeMap | null {
	const controlMap = new Map(controls.filter((c) => c.type === 'button').map((control) => [control.id, control]))

	switch (model) {
		case DeviceModelId.AtemMicroPanel: {
			const preview10 = controlMap.get('preview10')
			const preview1 = controlMap.get('preview1')
			const preview2 = controlMap.get('preview2')
			const preview3 = controlMap.get('preview3')
			const preview4 = controlMap.get('preview4')
			const preview5 = controlMap.get('preview5')
			const preview6 = controlMap.get('preview6')
			const preview7 = controlMap.get('preview7')
			const preview8 = controlMap.get('preview8')
			const preview9 = controlMap.get('preview9')

			if (
				!preview10 ||
				!preview1 ||
				!preview2 ||
				!preview3 ||
				!preview4 ||
				!preview5 ||
				!preview6 ||
				!preview7 ||
				!preview8 ||
				!preview9
			) {
				console.error('Missing controls for pincode map')
				return null
			}

			return {
				type: 'single-page',
				pincode: [0, 0], // Not used
				0: [preview10.column, preview10.row],
				1: [preview1.column, preview1.row],
				2: [preview2.column, preview2.row],
				3: [preview3.column, preview3.row],
				4: [preview4.column, preview4.row],
				5: [preview5.column, preview5.row],
				6: [preview6.column, preview6.row],
				7: [preview7.column, preview7.row],
				8: [preview8.column, preview8.row],
				9: [preview9.column, preview9.row],
			}
		}
		case DeviceModelId.DaVinciResolveReplayEditor:
			// Don't support pincode entry
			// TODO: should we support this?
			return {
				type: 'custom',
			}
		default:
			assertNever(model)
			return null
	}
}

export class BlackmagicControllerWrapper implements SurfaceInstance {
	readonly pluginId = PLUGIN_ID

	readonly #device: BlackmagicController
	readonly #surfaceId: string

	public get surfaceId(): string {
		return this.#surfaceId
	}
	public get productName(): string {
		return `Blackmagic ${this.#device.PRODUCT_NAME}`
	}

	public constructor(
		surfaceId: string,
		device: BlackmagicController,
		context: SurfaceContext,
		_registerProps: DeviceRegisterProps,
	) {
		this.#device = device
		this.#surfaceId = surfaceId

		this.#device.on('error', (e) => context.disconnect(e as any))

		this.#device.on('down', (control) => {
			context.keyDownById(`${control.row}/${control.column}`)
		})
		this.#device.on('up', (control) => {
			context.keyUpById(`${control.row}/${control.column}`)
		})
		this.#device.on('batteryLevel', (_level) => {
			// context.sendVariableValue(this.#surfaceId, 'batteryLevel', level.toString())
		})
		this.#device.on('tbar', (_control, level) => {
			context.sendVariableValue('tbarValueVariable', level.toString())
		})
		// this.#device
		// 	.getBatteryLevel()
		// 	.then((level) => {
		// 		client.sendVariableValue(this.#surfaceId, 'batteryLevel', (level ?? 0).toString())
		// 	})
		// 	.catch((e) => {
		// 		console.error('Failed to report battery level', e)
		// 	})
	}

	async close(): Promise<void> {
		await this.#device.clearPanel().catch(() => null)

		await this.#device.close()
	}
	async initDevice(): Promise<void> {
		// Start with blanking it
		await this.blankDevice()
	}

	async deviceAdded(): Promise<void> {
		// Unused
	}
	async setBrightness(_percent: number): Promise<void> {
		// Not supported
	}
	async blankDevice(): Promise<void> {
		this.#pendingDrawColors = {}

		await this.#device.clearPanel()
	}
	async draw(_signal: AbortSignal, d: DeviceDrawProps): Promise<void> {
		if (!d.color) d.color = '#000000'

		const control = this.#device.CONTROLS.find(
			(control): control is BlackmagicControllerButtonControlDefinition =>
				control.type === 'button' && control.row === d.row && control.column === d.column,
		)
		if (!control) return

		this.#pendingDrawColors[control.id] = { color: d.color, control }

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

	onLockedStatus(locked: boolean, characterCount: number): void {
		if (locked && this.#device.MODEL === DeviceModelId.AtemMicroPanel) {
			// Show a progress bar on the upper row to indicate number of characters entered

			const lockOutputKeyIds = [
				// Note: these are in order of value they represent
				'program1',
				'program2',
				'program3',
				'program4',
				'program5',
				'program6',
				'program7',
				'program8',
				'program9',
				'program10',
			]

			const controlMap = new Map(
				this.#device.CONTROLS.filter((c) => c.type === 'button').map((control) => [control.id, control]),
			)

			const colors: BlackmagicControllerSetButtonSomeValue[] = []

			for (let i = 0; i < characterCount && i < lockOutputKeyIds.length; i++) {
				const control = controlMap.get(lockOutputKeyIds[i])
				if (!control) continue

				switch (control.feedbackType) {
					case 'rgb':
						colors.push({
							type: 'rgb',
							keyId: lockOutputKeyIds[i],
							red: true,
							green: true,
							blue: true,
						})
						break
					case 'on-off':
						colors.push({
							type: 'on-off',
							keyId: lockOutputKeyIds[i],
							on: true,
						})
						break
					case 'none':
						// no-op
						break
					default:
						assertNever(control.feedbackType)
						break
				}
			}

			this.#device.setButtonStates(colors).catch((e) => {
				console.error(`write failed: ${e}`)
			})
		}
	}

	async showStatus(
		_signal: AbortSignal,
		_cardGenerator: CardGenerator,
		_hostname: string,
		_status: string,
	): Promise<void> {
		// Nothing to display here
		// TODO - do some flashing lights to indicate each status?
	}

	/**
	 * Trigger a redraw of this control, if it can be drawn
	 * @access protected
	 */
	#triggerRedraw = debounceFn(
		() => {
			const colors: BlackmagicControllerSetButtonSomeValue[] = []

			const threshold = 100 // Use a lower than 50% threshold, to make it more sensitive

			for (const [id, { color: rawColor, control }] of Object.entries(this.#pendingDrawColors)) {
				const color = parseColor(rawColor)
				const red = color.r >= threshold
				const green = color.g >= threshold
				const blue = color.b >= threshold

				switch (control.feedbackType) {
					case 'rgb':
						colors.push({
							keyId: id,
							type: 'rgb',
							red: color.r >= threshold,
							green: color.g >= threshold,
							blue: color.b >= threshold,
						})
						break
					case 'on-off':
						colors.push({
							keyId: id,
							type: 'on-off',
							on: red || green || blue,
						})
						break
					case 'none':
						// no-op
						break
					default:
						assertNever(control.feedbackType)
						break
				}
			}

			if (colors.length === 0) return

			this.#pendingDrawColors = {}
			this.#device.setButtonStates(colors).catch((e) => {
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
	#pendingDrawColors: Record<string, { color: string; control: BlackmagicControllerButtonControlDefinition }> = {}
}
