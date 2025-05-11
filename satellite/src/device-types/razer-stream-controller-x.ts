import { LoupedeckDevice, LoupedeckDisplayId, LoupedeckBufferFormat, LoupedeckModelId } from '@loupedeck/node'
import * as imageRs from '@julusian/image-rs'
import type { CardGenerator } from '../graphics/cards.js'
import type {
	ClientCapabilities,
	SurfaceContext,
	DeviceDrawProps,
	DeviceRegisterProps,
	SurfaceInstance,
	WrappedSurfaceEvents,
} from './api.js'
import { EventEmitter } from 'events'
import { LOUPEDECK_PLUGIN_ID } from './loupedeck-plugin.js'

export function compileRazerStreamControllerXProps(device: LoupedeckDevice): DeviceRegisterProps {
	return {
		brightness: true,
		rowCount: 3,
		columnCount: 5,
		bitmapSize: device.lcdKeySize,
		colours: true,
		text: false,
		pincodeMode: false, // TODO: Implement
	}
}

export class RazerStreamControllerXWrapper extends EventEmitter<WrappedSurfaceEvents> implements SurfaceInstance {
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
		super()

		this.#deck = device
		this.#surfaceId = surfaceId

		this.#deck.on('error', (e) => this.emit('error', e))

		if (device.modelId !== LoupedeckModelId.RazerStreamControllerX)
			throw new Error('Incorrect model passed to wrapper!')

		const convertButtonId = (type: 'button' | 'rotary', id: number): number => {
			if (type === 'button') {
				return id
			}

			// Discard
			return 99
		}
		this.#deck.on('down', (info) => context.keyDown(convertButtonId(info.type, info.index)))
		this.#deck.on('up', (info) => context.keyUp(convertButtonId(info.type, info.index)))
	}

	async close(): Promise<void> {
		await this.#deck.blankDevice(true, true).catch(() => null)

		await this.#deck.close()
	}
	async initDevice(): Promise<void> {
		console.log('Initialisng ' + this.surfaceId)

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
	async draw(_signal: AbortSignal, d: DeviceDrawProps): Promise<void> {
		if (d.image) {
			const buffer = await d.image(this.#deck.lcdKeySize, this.#deck.lcdKeySize, imageRs.PixelFormat.Rgb)
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

		const buffer = await cardGenerator.generateBasicCard(width, height, imageRs.PixelFormat.Rgb, hostname, status)

		if (signal.aborted) return

		await this.#deck.drawBuffer(LoupedeckDisplayId.Center, buffer, LoupedeckBufferFormat.RGB, width, height, 0, 0)
	}
}
