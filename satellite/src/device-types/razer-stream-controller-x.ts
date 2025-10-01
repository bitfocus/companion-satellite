import { LoupedeckDevice, LoupedeckDisplayId, LoupedeckBufferFormat, LoupedeckModelId } from '@loupedeck/node'
import type { CardGenerator } from '../graphics/cards.js'
import type { SurfaceContext, DeviceDrawProps, SurfaceInstance, DeviceRegisterProps } from './api.js'
import { LOUPEDECK_PLUGIN_ID } from './loupedeck-plugin.js'
import { Pincode5x3 } from './pincode.js'
import type { SatelliteSurfaceLayout } from '../generated/SurfaceManifestSchema.js'

const KEY_COUNT = 15
const COLUMNS = 5

function getControlId(index: number): string {
	return `${Math.floor(index / COLUMNS)}/${index % COLUMNS}`
}

export function compileRazerStreamControllerXProps(device: LoupedeckDevice): DeviceRegisterProps {
	const surfaceManifest: SatelliteSurfaceLayout = {
		stylePresets: {
			default: {
				bitmap: {
					w: device.lcdKeySize,
					h: device.lcdKeySize,
				},
			},
		},
		controls: {},
	}

	for (let i = 0; i < KEY_COUNT; i++) {
		surfaceManifest.controls[getControlId(i)] = {
			row: Math.floor(i / COLUMNS),
			column: i % COLUMNS,
		}
	}

	return {
		brightness: true,
		surfaceManifest,
		pincodeMap: Pincode5x3(),
	}
}

export class RazerStreamControllerXWrapper implements SurfaceInstance {
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

		if (device.modelId !== LoupedeckModelId.RazerStreamControllerX)
			throw new Error('Incorrect model passed to wrapper!')

		const convertButtonId = (type: 'button' | 'rotary', id: number): string | null => {
			if (type === 'button') {
				return getControlId(id)
			}

			// Discard
			return null
		}
		this.#deck.on('down', (info) => {
			const controlId = convertButtonId(info.type, info.index)
			if (controlId) context.keyDownById(controlId)
		})
		this.#deck.on('up', (info) => {
			const controlId = convertButtonId(info.type, info.index)
			if (controlId) context.keyUpById(controlId)
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
	async draw(_signal: AbortSignal, d: DeviceDrawProps): Promise<void> {
		if (d.image) {
			const buffer = await d.image(this.#deck.lcdKeySize, this.#deck.lcdKeySize, 'rgb')
			await this.#deck.drawKeyBuffer(d.keyIndex, buffer, LoupedeckBufferFormat.RGB)
		} else {
			throw new Error(`Cannot draw for Loupedeck without image`)
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
