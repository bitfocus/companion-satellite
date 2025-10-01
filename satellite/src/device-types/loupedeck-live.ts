import {
	LoupedeckDevice,
	LoupedeckDisplayId,
	LoupedeckBufferFormat,
	LoupedeckModelId,
	LoupedeckControlType,
} from '@loupedeck/node'
import type { CardGenerator } from '../graphics/cards.js'
import type { SurfaceContext, DeviceDrawProps, DeviceRegisterProps, SurfaceInstance } from './api.js'
import { parseColor } from './lib.js'
import { LOUPEDECK_PLUGIN_ID } from './loupedeck-plugin.js'
import { Pincode4x3 } from './pincode.js'
import type { SatelliteSurfaceLayout } from '../generated/SurfaceManifestSchema.js'
import { assertNever } from '../lib.js'

const convertButtonId = (type: 'button' | 'rotary', index: number): string | null => {
	if (type === 'button' && index >= 0 && index < 8) {
		return `3/${index}`
	} else if (type === 'rotary') {
		switch (index) {
			case 0:
				return '0/0'
			case 1:
				return '1/0'
			case 2:
				return '2/0'
			case 3:
				return '0/7'
			case 4:
				return '1/7'
			case 5:
				return '2/7'
		}
	}

	// Discard
	return null
}

export function compileLoupedeckLiveProps(device: LoupedeckDevice): DeviceRegisterProps {
	const surfaceManifest: SatelliteSurfaceLayout = {
		stylePresets: {
			default: {
				bitmap: {
					w: device.lcdKeySize,
					h: device.lcdKeySize,
				},
			},
			button: {
				colors: 'hex',
			},
			empty: {},
		},
		controls: {},
	}

	for (const control of device.controls) {
		const controlId = convertButtonId(control.type, control.index)
		if (!controlId) continue

		const [row, column] = controlId.split('/').map(Number)
		if (isNaN(row) || isNaN(column)) continue

		switch (control.type) {
			case LoupedeckControlType.Button:
				surfaceManifest.controls[controlId] = { row, column, stylePreset: 'button' }
				break
			case LoupedeckControlType.Rotary:
				surfaceManifest.controls[controlId] = { row, column, stylePreset: 'empty' }
				break
			default:
				assertNever(control.type)
				break
		}
	}

	// Populate lcd 'buttons'
	for (let y = 0; y < 3; y++) {
		for (let x = 2; x < 6; x++) {
			surfaceManifest.controls[`${y}/${x}`] = { row: y, column: x }
		}
	}

	return {
		brightness: true,
		surfaceManifest,
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

		this.#deck.on('down', (info) => {
			const id = convertButtonId(info.type, info.index)
			if (!id) return

			context.keyDownById(id)
		})
		this.#deck.on('up', (info) => {
			const id = convertButtonId(info.type, info.index)
			if (!id) return

			context.keyUpById(id)
		})
		this.#deck.on('rotate', (info, delta) => {
			if (info.type !== LoupedeckControlType.Rotary) return

			const id = convertButtonId(info.type, info.index)
			if (!id) return

			if (delta < 0) {
				context.rotateLeftById(id)
			} else if (delta > 0) {
				context.rotateRightById(id)
			}
		})
		const translateKeyIndex = (key: number): string => {
			const x = key % 4
			const y = Math.floor(key / 4)
			return `${y}/${x + 2}`
		}
		this.#deck.on('touchstart', (data) => {
			for (const touch of data.changedTouches) {
				if (touch.target.key !== undefined) {
					context.keyDownById(translateKeyIndex(touch.target.key))
				}
			}
		})
		this.#deck.on('touchend', (data) => {
			for (const touch of data.changedTouches) {
				if (touch.target.key !== undefined) {
					context.keyUpById(translateKeyIndex(touch.target.key))
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

	async deviceAdded(): Promise<void> {}
	async setBrightness(percent: number): Promise<void> {
		await this.#deck.setBrightness(percent / 100)
	}
	async blankDevice(skipButtons?: boolean): Promise<void> {
		await this.#deck.blankDevice(true, !skipButtons)
	}
	async draw(signal: AbortSignal, d: DeviceDrawProps): Promise<void> {
		if (d.row == 3) {
			const color = parseColor(d.color)

			await this.#deck.setButtonColor({
				id: d.column,
				red: color.r,
				green: color.g,
				blue: color.b,
			})

			return
		}

		const x = d.column - 2
		if (x >= 0 && x < 4) {
			const keyIndex = x + d.row * 4
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
