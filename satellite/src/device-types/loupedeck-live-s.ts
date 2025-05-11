import {
	LoupedeckDevice,
	LoupedeckDisplayId,
	LoupedeckBufferFormat,
	LoupedeckModelId,
	LoupedeckControlType,
} from '@loupedeck/node'
import * as imageRs from '@julusian/image-rs'
import { CardGenerator } from '../graphics/cards.js'
import type {
	ClientCapabilities,
	SurfaceContext,
	DeviceDrawProps,
	DeviceRegisterProps,
	WrappedSurface,
	WrappedSurfaceEvents,
} from './api.js'
import { parseColor } from './lib.js'
import { EventEmitter } from 'events'
import { LOUPEDECK_PLUGIN_ID } from './loupedeck-plugin.js'

export function compileLoupedeckLiveSProps(device: LoupedeckDevice): DeviceRegisterProps {
	return {
		brightness: true,
		rowCount: 3,
		columnCount: 7,
		bitmapSize: device.lcdKeySize,
		colours: true,
		text: false,
		pincodeMode: false, // TODO: Implement
	}
}

export class LoupedeckLiveSWrapper extends EventEmitter<WrappedSurfaceEvents> implements WrappedSurface {
	readonly pluginId = LOUPEDECK_PLUGIN_ID

	readonly #deck: LoupedeckDevice
	readonly #surfaceId: string

	public get surfaceId(): string {
		return this.#surfaceId
	}
	public get productName(): string {
		return this.#deck.modelName
	}

	public constructor(surfaceId: string, device: LoupedeckDevice) {
		super()

		this.#deck = device
		this.#surfaceId = surfaceId

		this.#deck.on('error', (e) => this.emit('error', e))

		if (device.modelId !== LoupedeckModelId.LoupedeckLiveS) throw new Error('Incorrect model passed to wrapper!')
	}

	async close(): Promise<void> {
		await this.#deck.blankDevice(true, true).catch(() => null)

		await this.#deck.close()
	}
	async initDevice(client: SurfaceContext): Promise<void> {
		const convertButtonId = (type: 'button' | 'rotary', id: number): number => {
			if (type === 'button') {
				// return 24 + id
				switch (id) {
					case 0:
						return 14
					case 1:
						return 6
					case 2:
						return 13
					case 3:
						return 20
				}
			} else if (type === 'rotary') {
				switch (id) {
					case 0:
						return 0
					case 1:
						return 7
				}
			}

			// Discard
			return 99
		}
		console.log('Registering key events for ' + this.surfaceId)
		this.#deck.on('down', (info) => client.keyDown(convertButtonId(info.type, info.index)))
		this.#deck.on('up', (info) => client.keyUp(convertButtonId(info.type, info.index)))
		this.#deck.on('rotate', (info, delta) => {
			if (info.type !== LoupedeckControlType.Rotary) return

			const id2 = convertButtonId(info.type, info.index)
			if (id2 < 90) {
				if (delta < 0) {
					client.rotateLeft(id2)
				} else if (delta > 0) {
					client.rotateRight(id2)
				}
			}
		})
		const translateKeyIndex = (key: number): number => {
			const x = key % 5
			const y = Math.floor(key / 5)
			return y * 7 + x + 1
		}
		this.#deck.on('touchstart', (data) => {
			for (const touch of data.changedTouches) {
				if (touch.target.key !== undefined) {
					client.keyDown(translateKeyIndex(touch.target.key))
				}
			}
		})
		this.#deck.on('touchend', (data) => {
			for (const touch of data.changedTouches) {
				if (touch.target.key !== undefined) {
					client.keyUp(translateKeyIndex(touch.target.key))
				}
			}
		})

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
				await this.#deck.drawKeyBuffer(keyIndex, d.image, LoupedeckBufferFormat.RGB)
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

		const buffer = await cardGenerator.generateBasicCard(width, height, imageRs.PixelFormat.Rgb, hostname, status)

		if (signal.aborted) return

		await this.#deck.drawBuffer(LoupedeckDisplayId.Center, buffer, LoupedeckBufferFormat.RGB, width, height, 0, 0)
	}
}
