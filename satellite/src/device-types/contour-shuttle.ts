import type {
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
import { assertNever } from '../lib.js'
import { isAShuttleDevice, ProductModelId, setupShuttle, Shuttle } from 'shuttle-node'
import crypto from 'node:crypto'
import type { SatelliteSurfaceLayout } from '../generated/SurfaceManifestSchema.js'

const PLUGIN_ID = 'contour-shuttle'

export class ContourShuttlePlugin implements SurfacePlugin<HIDDevice> {
	readonly pluginId = PLUGIN_ID
	readonly pluginName = 'Contour Shuttle'
	readonly pluginComment = []

	async init(): Promise<void> {
		// Nothing to do
	}
	async destroy(): Promise<void> {
		// Nothing to do
	}

	checkSupportsHidDevice = (device: HIDDevice): DiscoveredSurfaceInfo<HIDDevice> | null => {
		if (!isAShuttleDevice(device)) return null

		if (!device || !device.path) return null

		// The devices don't have serialnumbers, so fake something based on the path. Not the most stable, but the best we can do
		const fakeDeviceId = crypto.createHash('sha1').update(`${device.productId}-${device.path}`).digest('hex')

		return {
			surfaceId: `contourshuttle:${fakeDeviceId}`,
			description: device.product ?? 'Contour Shuttle', // TODO: Better description
			pluginInfo: device,
		}
	}

	openSurface = async (
		surfaceId: string,
		pluginInfo: HIDDevice,
		context: SurfaceContext,
	): Promise<OpenSurfaceResult> => {
		if (!pluginInfo.path) throw new Error('No path provided')

		const controller = await setupShuttle(pluginInfo.path)
		// const controller = await openBlackmagicController(pluginInfo.path)

		const modelInfo = compileModelInfo(controller.info.productModelId)

		const registerProps = compileRegisterProps(modelInfo)

		return {
			surface: new ContourShuttleWrapper(surfaceId, controller, context, registerProps, modelInfo),
			registerProps,
		}
	}
}

function compileRegisterProps(modelInfo: ShuttleModelInfo): DeviceRegisterProps {
	const surfaceManifest: SatelliteSurfaceLayout = {
		stylePresets: {
			default: {},
		},
		controls: {
			jog: {
				row: modelInfo.jog[1],
				column: modelInfo.jog[0],
			},
			shuttle: {
				row: modelInfo.shuttle[1],
				column: modelInfo.shuttle[0],
			},
		},
	}

	for (const button of modelInfo.buttons) {
		surfaceManifest.controls[`${button[1]}/${button[0]}`] = {
			row: button[1],
			column: button[0],
		}
	}

	return {
		brightness: false,
		surfaceManifest,
		transferVariables: [
			{
				id: 'jogValueVariable',
				type: 'input',
				name: 'Variable to store Jog value to',
				description: 'This produces a value or either 1 or -1 for each click of the wheel.',
			},
			{
				id: 'shuttleValueVariable',
				type: 'input',
				name: 'Variable to store Shuttle value to',
				description:
					'This produces a value between -7 to 7. You can use an expression to convert it into a different range.',
			},
		],
		pincodeMap: { type: 'custom' }, // Don't want to attempt pincode
	}
}

interface ShuttleModelInfo {
	totalCols: number
	totalRows: number
	jog: [number, number]
	shuttle: [number, number]
	buttons: [number, number][]
}

function compileModelInfo(model: ProductModelId): ShuttleModelInfo {
	switch (model) {
		case ProductModelId.ShuttleXpress:
			return {
				// Treat as:
				// 3 buttons
				// button, two encoders (jog and shuttle), button
				// Map the encoders in the same position (but a different row) for consistency and compatibility
				totalCols: 4,
				totalRows: 2,

				jog: [1, 1],
				shuttle: [2, 1],
				buttons: [
					[0, 1],
					[0, 0],
					[1, 0],
					[2, 0],
					[3, 0],
					[3, 1],
				],
			}
		case ProductModelId.ShuttleProV1:
			return {
				// Same as Pro V2 only without the buttons either side of the encoders
				// Map the same for consistency and compatibility
				totalCols: 5,
				totalRows: 4,

				// TODO(Someone with hardware): This mapping is guesswork and hasn't been tested
				jog: [1, 2],
				shuttle: [2, 2],
				buttons: [
					// 4 buttons
					[0, 0],
					[1, 0],
					[2, 0],
					[3, 0],

					// 5 buttons
					[0, 1],
					[1, 1],
					[2, 1],
					[3, 1],
					[4, 1],

					// 2 buttons (combine with below)
					[0, 3],
					[3, 3],

					// 2 buttons
					[1, 3],
					[2, 3],
				],
			}
		case ProductModelId.ShuttleProV2:
			return {
				// 4 buttons
				// 5 buttons
				// button, two encoders (jog and shuttle), button
				// 2 buttons (combine with the row below)
				// 2 buttons
				totalCols: 5,
				totalRows: 4,

				jog: [1, 2],
				shuttle: [2, 2],
				buttons: [
					// 4 buttons
					[0, 0],
					[1, 0],
					[2, 0],
					[3, 0],

					// 5 buttons
					[0, 1],
					[1, 1],
					[2, 1],
					[3, 1],
					[4, 1],

					// 2 buttons (combine with below)
					[0, 3],
					[3, 3],

					// 2 buttons
					[1, 3],
					[2, 3],

					// 2 buttons either side of encoder
					[0, 2],
					[3, 2],
				],
			}
		default:
			assertNever(model)
			throw new Error(`Unknown model ${model}`)
	}
}

export class ContourShuttleWrapper implements SurfaceInstance {
	readonly pluginId = PLUGIN_ID

	readonly #device: Shuttle
	readonly #surfaceId: string
	readonly #modelInfo: ShuttleModelInfo

	public get surfaceId(): string {
		return this.#surfaceId
	}
	public get productName(): string {
		return `Contour ${this.#device.info.name}`
	}

	public constructor(
		surfaceId: string,
		device: Shuttle,
		context: SurfaceContext,
		_registerProps: DeviceRegisterProps,
		modelInfo: ShuttleModelInfo,
	) {
		this.#device = device
		this.#surfaceId = surfaceId

		this.#modelInfo = modelInfo

		this.#device.on('error', (e) => context.disconnect(e))

		this.#device.on('down', (info) => {
			const xy = this.#modelInfo.buttons[info]
			if (!xy) return

			context.keyDownById(`${xy[1]}/${xy[0]}`)
		})

		this.#device.on('up', (info) => {
			const xy = this.#modelInfo.buttons[info]
			if (!xy) return

			context.keyUpById(`${xy[1]}/${xy[0]}`)
		})

		this.#device.on('jog', (delta) => {
			const xy = this.#modelInfo.jog
			if (!xy) return

			if (delta === 1) {
				context.rotateRightById('jog')
			} else {
				context.rotateLeftById('jog')
			}

			console.log(`Jog position has changed`, delta)
			context.sendVariableValue('jogValueVariable', delta.toString())
			setTimeout(() => {
				context.sendVariableValue('jogValueVariable', '0')
			}, 20)
		})

		let lastShuttle = 0
		this.#device.on('shuttle', (shuttle) => {
			const xy = this.#modelInfo.shuttle
			if (!xy) return

			if (lastShuttle < shuttle) {
				context.rotateRightById('shuttle')
			} else {
				context.rotateLeftById('shuttle')
			}
			lastShuttle = shuttle

			console.log(`Shuttle value changed`, shuttle)
			context.sendVariableValue('shuttleValueVariable', shuttle.toString())
		})

		this.#device.on('disconnected', () => {
			context.disconnect(new Error('Device disconnected'))
		})
	}

	async close(): Promise<void> {
		await this.#device.close()
	}
	async initDevice(): Promise<void> {
		// Nothing to do
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
