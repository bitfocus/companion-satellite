import {
	XencelabsQuickKeys,
	XencelabsQuickKeysDisplayBrightness,
	XencelabsQuickKeysWheelSpeed,
	XencelabsQuickKeysDisplayOrientation,
	WheelEvent,
	XencelabsQuickKeysManagerInstance,
} from '@xencelabs-quick-keys/node'
import type {
	SurfaceInstance,
	DeviceDrawProps,
	ClientCapabilities,
	SurfacePlugin,
	SurfacePluginDetectionEvents,
	SurfacePluginDetection,
	OpenSurfaceResult,
	SurfaceContext,
} from './api.js'
import { parseColor } from './lib.js'
import { EventEmitter } from 'events'
import type { CardGenerator } from '../graphics/cards.js'

class QuickKeysPluginDetection
	extends EventEmitter<SurfacePluginDetectionEvents<XencelabsQuickKeys>>
	implements SurfacePluginDetection<XencelabsQuickKeys>
{
	initialised = false

	async triggerScan(): Promise<void> {
		if (!this.initialised) return
		// TODO - or should this go the other route and use openDevicesFromArray?
		await XencelabsQuickKeysManagerInstance.scanDevices()
	}
}

const PLUGIN_ID = 'xencelabs-quick-keys'

export class QuickKeysPlugin implements SurfacePlugin<XencelabsQuickKeys> {
	readonly pluginId = PLUGIN_ID
	readonly pluginName = 'Xencelabs Quick Keys'

	readonly detection = new QuickKeysPluginDetection()

	async init(): Promise<void> {
		if (this.detection.initialised) return

		this.detection.initialised = true

		XencelabsQuickKeysManagerInstance.on('connect', this.#connectListener)
		XencelabsQuickKeysManagerInstance.on('disconnect', this.#disconnectListener)
	}
	async destroy(): Promise<void> {
		this.detection.initialised = false

		XencelabsQuickKeysManagerInstance.off('connect', this.#connectListener)
		XencelabsQuickKeysManagerInstance.off('disconnect', this.#disconnectListener)

		// Ensure all devices are closed
		await XencelabsQuickKeysManagerInstance.closeAll()
	}

	#connectListener = (surface: XencelabsQuickKeys) => {
		if (surface.deviceId) {
			this.detection.emit('deviceAdded', {
				surfaceId: `quickkeys:${surface.deviceId}`,
				description: `Quick Keys`,
				pluginInfo: surface,
			})
		} else {
			console.warn('Ignoring wired XencelabsQuickKeys device without serial number')

			surface.on('error', (e) => {
				// Ensure errors don't cause a crash
				console.error('Error from device:', e)
			})
		}
	}
	#disconnectListener = (surface: XencelabsQuickKeys) => {
		if (surface.deviceId) {
			this.detection.emit('deviceRemoved', surface.deviceId)
		}
	}

	openSurface = async (
		surfaceId: string,
		quickkeys: XencelabsQuickKeys,
		context: SurfaceContext,
	): Promise<OpenSurfaceResult> => {
		return {
			surface: new QuickKeysWrapper(surfaceId, quickkeys, context),
			registerProps: {
				brightness: true,
				rowCount: 2,
				columnCount: 6,
				bitmapSize: null,
				colours: true,
				text: true,
				pincodeMap: null, // TODO - implement?
			},
		}
	}
}

function keyToCompanion(k: number): number | null {
	if (k >= 0 && k < 4) return k + 1
	if (k >= 4 && k < 8) return k + 3
	if (k === 8) return 0
	if (k === 9) return 5
	return null
}

export class QuickKeysWrapper implements SurfaceInstance {
	readonly pluginId = PLUGIN_ID

	readonly #surface: XencelabsQuickKeys
	readonly #surfaceId: string

	#statusTimer: NodeJS.Timeout | undefined
	#unsub: (() => void) | undefined

	public get surfaceId(): string {
		return this.#surfaceId
	}
	public get productName(): string {
		return 'Xencelabs Quick Keys'
	}

	public constructor(surfaceId: string, surface: XencelabsQuickKeys, context: SurfaceContext) {
		this.#surface = surface
		this.#surfaceId = surfaceId

		this.#surface.on('error', (e) => context.disconnect(e as any))

		const handleDown = (key: number) => {
			const k = keyToCompanion(key)
			if (k !== null) {
				context.keyDown(k)
			}
		}
		const handleUp = (key: number) => {
			const k = keyToCompanion(key)
			if (k !== null) {
				context.keyUp(k)
			}
		}
		const handleWheel = (ev: WheelEvent) => {
			switch (ev) {
				case WheelEvent.Left:
					context.rotateLeft(5)
					break
				case WheelEvent.Right:
					context.rotateRight(5)
					break
			}
		}

		this.#surface.on('down', handleDown)
		this.#surface.on('up', handleUp)
		this.#surface.on('wheel', handleWheel)
		this.#unsub = () => {
			this.#surface.off('down', handleDown)
			this.#surface.off('up', handleUp)
			this.#surface.off('wheel', handleWheel)
		}
	}

	async close(): Promise<void> {
		this.#unsub?.()

		this.stopStatusInterval()

		await this.#surface.stopData()
	}
	async initDevice(): Promise<void> {
		console.log('Initialising ' + this.surfaceId)

		await this.#surface.startData()

		await this.#surface.setWheelSpeed(XencelabsQuickKeysWheelSpeed.Normal) // TODO dynamic
		await this.#surface.setDisplayOrientation(XencelabsQuickKeysDisplayOrientation.Rotate0) // TODO dynamic
		await this.#surface.setSleepTimeout(0) // TODO dynamic

		// Start with blanking it
		await this.blankDevice()
	}

	updateCapabilities(_capabilities: ClientCapabilities): void {
		// Not used
	}

	async deviceAdded(): Promise<void> {
		await this.clearStatus()
	}
	async setBrightness(percent: number): Promise<void> {
		const opts = Object.values<XencelabsQuickKeysDisplayBrightness | string>(
			XencelabsQuickKeysDisplayBrightness,
		).filter((k): k is XencelabsQuickKeysDisplayBrightness => typeof k === 'number')

		const perStep = 100 / (opts.length - 1)
		const step = Math.round(percent / perStep)

		await this.#surface.setDisplayBrightness(opts[step])
	}
	async blankDevice(): Promise<void> {
		await this.clearStatus()

		// Do some initial setup too

		await this.#surface.setWheelColor(0, 0, 0)

		for (let i = 0; i < 8; i++) {
			await this.#surface.setKeyText(i, '')
		}
	}
	async draw(signal: AbortSignal, data: DeviceDrawProps): Promise<void> {
		await this.clearStatus()

		if (signal.aborted) return

		if (typeof data.text === 'string') {
			let keyIndex: number | null = null
			if (data.keyIndex >= 1 && data.keyIndex < 5) keyIndex = data.keyIndex - 1
			if (data.keyIndex >= 7 && data.keyIndex < 11) keyIndex = data.keyIndex - 3

			if (keyIndex !== null) {
				await this.#surface.setKeyText(keyIndex, data.text.substr(0, 8))
			}
		}

		if (signal.aborted) return

		const wheelIndex = 5
		if (data.color && data.keyIndex === wheelIndex) {
			const { r, g, b } = parseColor(data.color)

			await this.#surface.setWheelColor(r, g, b)
		}
	}
	async showStatus(
		_signal: AbortSignal,
		_cardGenerator: CardGenerator,
		_hostname: string,
		status: string,
	): Promise<void> {
		this.stopStatusInterval()

		const newMessage = status
		this.#statusTimer = setInterval(() => {
			// Update on an interval, as we cant set it unlimited
			this.#surface.showOverlayText(5, newMessage).catch((e) => {
				console.error(`Overlay failed: ${e}`)
			})
		}, 3000)

		await this.#surface.showOverlayText(5, newMessage)
	}

	private stopStatusInterval(): boolean {
		if (this.#statusTimer) {
			clearInterval(this.#statusTimer)
			this.#statusTimer = undefined

			return true
		}

		return false
	}
	private async clearStatus(msg?: string): Promise<void> {
		if (this.stopStatusInterval()) {
			await this.#surface.showOverlayText(1, msg ?? '')
		}
	}
}
