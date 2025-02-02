import {
	XencelabsQuickKeys,
	XencelabsQuickKeysDisplayBrightness,
	XencelabsQuickKeysWheelSpeed,
	XencelabsQuickKeysDisplayOrientation,
	WheelEvent,
	XencelabsQuickKeysManagerInstance,
} from '@xencelabs-quick-keys/node'
import {
	WrappedSurface,
	DeviceRegisterProps,
	DeviceDrawProps,
	ClientCapabilities,
	CompanionClient,
	WrappedSurfaceEvents,
	SurfacePlugin,
	SurfacePluginDetectionEvents,
	SurfacePluginDetection,
} from './api.js'
import { parseColor } from './lib.js'
import { EventEmitter } from 'events'
import type { CardGenerator } from '../cards.js'

class QuickKeysPluginDetection
	extends EventEmitter<SurfacePluginDetectionEvents<XencelabsQuickKeys>>
	implements SurfacePluginDetection<XencelabsQuickKeys>
{
	async triggerScan(): Promise<void> {
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
		XencelabsQuickKeysManagerInstance.on('connect', this.#connectListener)
		XencelabsQuickKeysManagerInstance.on('disconnect', this.#disconnectListener)
	}
	async destroy(): Promise<void> {
		XencelabsQuickKeysManagerInstance.off('connect', this.#connectListener)
		XencelabsQuickKeysManagerInstance.off('disconnect', this.#disconnectListener)

		// Ensure all devices are closed?
		// await XencelabsQuickKeysManagerInstance.closeAll()
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
		_cardGenerator: CardGenerator,
	): Promise<WrappedSurface> => {
		return new QuickKeysWrapper(surfaceId, quickkeys)
	}
}

function keyToCompanion(k: number): number | null {
	if (k >= 0 && k < 4) return k + 1
	if (k >= 4 && k < 8) return k + 3
	if (k === 8) return 0
	if (k === 9) return 5
	return null
}

export class QuickKeysWrapper extends EventEmitter<WrappedSurfaceEvents> implements WrappedSurface {
	readonly pluginId = PLUGIN_ID

	readonly #surface: XencelabsQuickKeys
	readonly #surfaceId: string

	#companionSupportsCombinedEncoders = true

	#statusTimer: NodeJS.Timeout | undefined
	#unsub: (() => void) | undefined

	public get surfaceId(): string {
		return this.#surfaceId
	}
	public get productName(): string {
		return 'Xencelabs Quick Keys'
	}

	public constructor(surfaceId: string, surface: XencelabsQuickKeys) {
		super()

		this.#surface = surface
		this.#surfaceId = surfaceId

		this.#surface.on('error', (e) => this.emit('error', e))
	}

	getRegisterProps(): DeviceRegisterProps {
		return {
			keysTotal: 12,
			keysPerRow: 6,
			bitmapSize: null,
			colours: true,
			text: true,
		}
	}
	async close(): Promise<void> {
		this.#unsub?.()

		this.stopStatusInterval()

		await this.#surface.stopData()
	}
	async initDevice(client: CompanionClient, status: string): Promise<void> {
		console.log('Registering key events for ' + this.surfaceId)

		const handleDown = (key: number) => {
			const k = keyToCompanion(key)
			if (k !== null) {
				client.keyDown(this.surfaceId, k)
			}
		}
		const handleUp = (key: number) => {
			const k = keyToCompanion(key)
			if (k !== null) {
				client.keyUp(this.surfaceId, k)
			}
		}
		const handleWheel = (ev: WheelEvent) => {
			switch (ev) {
				case WheelEvent.Left:
					if (this.#companionSupportsCombinedEncoders) {
						client.rotateLeft(this.surfaceId, 5)
					} else {
						client.keyUp(this.surfaceId, 11)
					}
					break
				case WheelEvent.Right:
					if (this.#companionSupportsCombinedEncoders) {
						client.rotateRight(this.surfaceId, 5)
					} else {
						client.keyDown(this.surfaceId, 11)
					}
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

		await this.#surface.startData()

		await this.#surface.setWheelSpeed(XencelabsQuickKeysWheelSpeed.Normal) // TODO dynamic
		await this.#surface.setDisplayOrientation(XencelabsQuickKeysDisplayOrientation.Rotate0) // TODO dynamic
		await this.#surface.setSleepTimeout(0) // TODO dynamic

		// Start with blanking it
		await this.blankDevice()

		this.showStatus(client.host, status)
	}

	updateCapabilities(capabilities: ClientCapabilities): void {
		this.#companionSupportsCombinedEncoders = capabilities.useCustomBitmapResolution
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
	async draw(data: DeviceDrawProps): Promise<void> {
		await this.clearStatus()

		if (typeof data.text === 'string') {
			let keyIndex: number | null = null
			if (data.keyIndex >= 1 && data.keyIndex < 5) keyIndex = data.keyIndex - 1
			if (data.keyIndex >= 7 && data.keyIndex < 11) keyIndex = data.keyIndex - 3

			if (keyIndex !== null) {
				await this.#surface.setKeyText(keyIndex, data.text.substr(0, 8))
			}
		}

		const wheelIndex = this.#companionSupportsCombinedEncoders ? 5 : 11
		if (data.color && data.keyIndex === wheelIndex) {
			const { r, g, b } = parseColor(data.color)

			await this.#surface.setWheelColor(r, g, b)
		}
	}
	showStatus(_hostname: string, status: string): void {
		this.stopStatusInterval()

		const newMessage = status
		this.#statusTimer = setInterval(() => {
			// Update on an interval, as we cant set it unlimited
			this.#surface.showOverlayText(5, newMessage).catch((e) => {
				console.error(`Overlay failed: ${e}`)
			})
		}, 3000)

		this.#surface.showOverlayText(5, newMessage).catch((e) => {
			console.error(`Overlay failed: ${e}`)
		})
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
