import {
	XencelabsQuickKeys,
	XencelabsQuickKeysDisplayBrightness,
	XencelabsQuickKeysWheelSpeed,
	XencelabsQuickKeysDisplayOrientation,
	WheelEvent,
} from '@xencelabs-quick-keys/node'
import { WrappedDevice, DeviceRegisterProps, DeviceDrawProps, ClientCapabilities, CompanionClient } from './api'

function keyToCompanion(k: number): number | null {
	if (k >= 0 && k < 4) return k + 1
	if (k >= 4 && k < 8) return k + 3
	if (k === 8) return 0
	if (k === 9) return 5
	return null
}
export class QuickKeysWrapper implements WrappedDevice {
	readonly #surface: XencelabsQuickKeys
	readonly #deviceId: string

	#companionSupportsCombinedEncoders = true

	#statusTimer: NodeJS.Timeout | undefined
	#unsub: (() => void) | undefined

	public get deviceId(): string {
		return this.#deviceId
	}
	public get productName(): string {
		return 'Xencelabs Quick Keys'
	}

	public constructor(deviceId: string, surface: XencelabsQuickKeys) {
		this.#surface = surface
		this.#deviceId = deviceId
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
		console.log('Registering key events for ' + this.deviceId)

		const handleDown = (key: number) => {
			const k = keyToCompanion(key)
			if (k !== null) {
				client.keyDown(this.deviceId, k)
			}
		}
		const handleUp = (key: number) => {
			const k = keyToCompanion(key)
			if (k !== null) {
				client.keyUp(this.deviceId, k)
			}
		}
		const handleWheel = (ev: WheelEvent) => {
			switch (ev) {
				case WheelEvent.Left:
					if (this.#companionSupportsCombinedEncoders) {
						client.rotateLeft(this.deviceId, 5)
					} else {
						client.keyUp(this.deviceId, 11)
					}
					break
				case WheelEvent.Right:
					if (this.#companionSupportsCombinedEncoders) {
						client.rotateRight(this.deviceId, 5)
					} else {
						client.keyDown(this.deviceId, 11)
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
			const r = parseInt(data.color.substr(1, 2), 16)
			const g = parseInt(data.color.substr(3, 2), 16)
			const b = parseInt(data.color.substr(5, 2), 16)

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
