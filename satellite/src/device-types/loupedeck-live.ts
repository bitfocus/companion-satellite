import {
	LoupedeckDevice,
	LoupedeckDisplayId,
	LoupedeckBufferFormat,
	LoupedeckModelId,
	LoupedeckControlType,
} from '@loupedeck/node'
import * as imageRs from '@julusian/image-rs'
import type { CardGenerator } from '../graphics/cards.js'
import type {
	ClientCapabilities,
	SurfaceContext,
	DeviceDrawProps,
	DeviceRegisterProps,
	SurfaceInstance,
} from './api.js'
import { parseColor } from './lib.js'
import { LOUPEDECK_PLUGIN_ID } from './loupedeck-plugin.js'
import { Pincode4x3 } from './pincode.js'

export function compileLoupedeckLiveProps(device: LoupedeckDevice): DeviceRegisterProps {
	return {
		brightness: true,
		rowCount: 4,
		columnCount: 8,
		bitmapSize: device.lcdKeySize,
		colours: true,
		text: false,
		pincodeMap: Pincode4x3(2),
	}
}
export class LoupedeckLiveWrapper implements SurfaceInstance {
	readonly pluginId = LOUPEDECK_PLUGIN_ID

	readonly #deck: LoupedeckDevice
	readonly #surfaceId: string

	public get surfaceId(): string {
		return this.#surfaceId
	}
	public get productName(): string {
		return this.#deck.modelName
	}

	public constructor(surfaceId: string, device: LoupedeckDevice, context: SurfaceContext) {
		this.#deck = device
		this.#surfaceId = surfaceId

		this.#deck.on('error', (e) => context.disconnect(e))

		if (
			device.modelId !== LoupedeckModelId.LoupedeckLive &&
			device.modelId !== LoupedeckModelId.RazerStreamController
		)
			throw new Error('Incorrect model passed to wrapper!')

		const convertButtonId = (type: 'button' | 'rotary', id: number): number => {
			if (type === 'button' && id >= 0 && id < 8) {
				return 24 + id
			} else if (type === 'rotary') {
				switch (id) {
					case 0:
						return 0
					case 1:
						return 8
					case 2:
						return 16
					case 3:
						return 7
					case 4:
						return 15
					case 5:
						return 23
				}
			}

			// Discard
			return 99
		}
		this.#deck.on('down', (info) => context.keyDown(convertButtonId(info.type, info.index)))
		this.#deck.on('up', (info) => context.keyUp(convertButtonId(info.type, info.index)))
		this.#deck.on('rotate', (info, delta) => {
			if (info.type !== LoupedeckControlType.Rotary) return

			const id2 = convertButtonId(info.type, info.index)
			if (id2 < 90) {
				if (delta < 0) {
					context.rotateLeft(id2)
				} else if (delta > 0) {
					context.rotateRight(id2)
				}
			}
		})
		const translateKeyIndex = (key: number): number => {
			const x = key % 4
			const y = Math.floor(key / 4)
			return y * 8 + x + 2
		}
		this.#deck.on('touchstart', (data) => {
			for (const touch of data.changedTouches) {
				if (touch.target.key !== undefined) {
					context.keyDown(translateKeyIndex(touch.target.key))
				}
			}
		})
		this.#deck.on('touchend', (data) => {
			for (const touch of data.changedTouches) {
				if (touch.target.key !== undefined) {
					context.keyUp(translateKeyIndex(touch.target.key))
				}
			}
		})
	}

	async close(): Promise<void> {
		await this.#deck.blankDevice(true, true).catch(() => null)

		await this.#deck.close()
	}
	async initDevice(): Promise<void> {
		// Start with blanking it
		await this.blankDevice()
	}

	updateCapabilities(_capabilities: ClientCapabilities): void {
		// Not used
	}

	async deviceAdded(): Promise<void> {}
	async setBrightness(percent: number): Promise<void> {
		await this.#deck.setBrightness(percent / 100)
	}
	async blankDevice(skipButtons?: boolean): Promise<void> {
		await this.#deck.blankDevice(true, !skipButtons)
	}
	async draw(signal: AbortSignal, d: DeviceDrawProps): Promise<void> {
		if (d.keyIndex >= 24 && d.keyIndex < 32) {
			const index = d.keyIndex - 24

			const color = parseColor(d.color)

			await this.#deck.setButtonColor({
				id: index,
				red: color.r,
				green: color.g,
				blue: color.b,
			})

			return
		}
		const x = (d.keyIndex % 8) - 2
		const y = Math.floor(d.keyIndex / 8)

		if (x >= 0 && x < 4) {
			const keyIndex = x + y * 4
			if (d.image) {
				const buffer = await d.image(this.#deck.lcdKeySize, this.#deck.lcdKeySize, 'rgb')
				await this.#deck.drawKeyBuffer(keyIndex, buffer, LoupedeckBufferFormat.RGB)
			} else {
				throw new Error(`Cannot draw for Loupedeck without image`)
			}
		}
	}

	async showStatus(
		signal: AbortSignal,
		cardGenerator: CardGenerator,
		hostname: string,
		status: string,
	): Promise<void> {
		const width = this.#deck.displayMain.width
		const height = this.#deck.displayMain.height

		const buffer = await cardGenerator.generateBasicCard(width, height, 'rgb', hostname, status)

		if (signal.aborted) return

		await this.#deck.drawBuffer(LoupedeckDisplayId.Center, buffer, LoupedeckBufferFormat.RGB, width, height, 0, 0)
	}
}
