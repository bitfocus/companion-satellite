import {
	LoupedeckDevice,
	LoupedeckDisplayId,
	LoupedeckBufferFormat,
	LoupedeckModelId,
	LoupedeckControlType,
} from '@loupedeck/node'
import { CardGenerator } from '../graphics/cards.js'
import type { SurfaceContext, DeviceDrawProps, DeviceRegisterProps, SurfaceInstance } from './api.js'
import { parseColor } from './lib.js'
import { LOUPEDECK_PLUGIN_ID } from './loupedeck-plugin.js'
import { Pincode5x3 } from './pincode.js'
import { assertNever } from '../lib.js'
import type { SatelliteSurfaceLayout } from '../generated/SurfaceSchema.js'

const convertButtonId = (type: 'button' | 'rotary', id: number): string | null => {
	if (type === 'button') {
		// return 24 + id
		switch (id) {
			case 0:
				return '2/0'
			case 1:
				return '0/6'
			case 2:
				return '1/6'
			case 3:
				return '2/6'
		}
	} else if (type === 'rotary') {
		switch (id) {
			case 0:
				return '0/0'
			case 1:
				return '1/0'
		}
	}

	// Discard
	return null
}

export function compileLoupedeckLiveSProps(device: LoupedeckDevice): DeviceRegisterProps {
	const surfaceSchema: SatelliteSurfaceLayout = {
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
				surfaceSchema.controls[controlId] = { row, column, stylePreset: 'button' }
				break
			case LoupedeckControlType.Rotary:
				surfaceSchema.controls[controlId] = { row, column, stylePreset: 'empty' }
				break
			default:
				assertNever(control.type)
				break
		}
	}

	// Populate lcd 'buttons'
	for (let y = 0; y < 3; y++) {
		for (let x = 1; x < 6; x++) {
			surfaceSchema.controls[`${y}/${x}`] = { row: y, column: x }
		}
	}

	return {
		brightness: true,
		surfaceSchema,
		pincodeMap: Pincode5x3(1),
	}
}

export class LoupedeckLiveSWrapper implements SurfaceInstance {
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

		if (device.modelId !== LoupedeckModelId.LoupedeckLiveS) throw new Error('Incorrect model passed to wrapper!')

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
			const x = key % 5
			const y = Math.floor(key / 5)
			return `${y}/${x + 1}`
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
		let buttonIndex: number | undefined
		switch (d.keyIndex) {
			case 14:
				buttonIndex = 0
				break
			case 6:
				buttonIndex = 1
				break
			case 13:
				buttonIndex = 2
				break
			case 20:
				buttonIndex = 3
				break
		}
		if (buttonIndex !== undefined) {
			const color = parseColor(d.color)

			await this.#deck.setButtonColor({
				id: buttonIndex,
				red: color.r,
				green: color.g,
				blue: color.b,
			})

			return
		}

		const x = (d.keyIndex % 7) - 1
		const y = Math.floor(d.keyIndex / 7)

		if (x >= 0 && x < 5) {
			const keyIndex = x + y * 5
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
