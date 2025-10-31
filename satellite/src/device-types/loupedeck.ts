import {
	listLoupedecks,
	LoupedeckBufferFormat,
	LoupedeckDevice,
	LoupedeckDisplayId,
	openLoupedeck,
	type LoupedeckDeviceInfo,
} from '@loupedeck/node'
import type {
	SurfacePlugin,
	DiscoveredSurfaceInfo,
	SurfaceInstance,
	DeviceRegisterProps,
	OpenSurfaceResult,
	SurfaceContext,
	DeviceDrawProps,
} from './api.js'
import { assertNever } from '../lib.js'
import { SatelliteSurfaceLayout } from '../generated/SurfaceManifestSchema.js'
import { Pincode5x3 } from './pincode.js'
import { CardGenerator } from '../graphics/cards.js'
import { parseColor } from './lib.js'

export const LOUPEDECK_PLUGIN_ID = 'loupedeck'

export class LoupedeckPlugin implements SurfacePlugin<LoupedeckDeviceInfo> {
	readonly pluginId = LOUPEDECK_PLUGIN_ID
	readonly pluginName = 'Loupedeck'

	async init(): Promise<void> {
		// Nothing to do
	}
	async destroy(): Promise<void> {
		// Nothing to do
	}

	scanForSurfaces = async (): Promise<DiscoveredSurfaceInfo<LoupedeckDeviceInfo>[]> => {
		const surfaceInfos = await listLoupedecks()

		const result: DiscoveredSurfaceInfo<LoupedeckDeviceInfo>[] = []
		for (const surfaceInfo of surfaceInfos) {
			if (!surfaceInfo.serialNumber) continue

			result.push({
				surfaceId: `loupedeck:${surfaceInfo.serialNumber}`,
				description: surfaceInfo.model, // TODO: Better description
				pluginInfo: surfaceInfo,
			})
		}

		return result
	}

	openSurface = async (
		surfaceId: string,
		pluginInfo: LoupedeckDeviceInfo,
		context: SurfaceContext,
	): Promise<OpenSurfaceResult> => {
		const loupedeck = await openLoupedeck(pluginInfo.path)
		return {
			surface: new LoupedeckWrapper(surfaceId, loupedeck, context),
			registerProps: compileLoupedeckProps(loupedeck),
		}
	}
}

function compileLoupedeckProps(device: LoupedeckDevice): DeviceRegisterProps {
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
		const { row, column } = control

		switch (control.type) {
			case 'button':
				surfaceManifest.controls[control.id] = {
					row,
					column,
					stylePreset: control.feedbackType === 'rgb' ? 'button' : 'default',
				}
				break
			case 'encoder':
				surfaceManifest.controls[control.id] = { row, column, stylePreset: 'empty' }
				break
			case 'wheel':
				if (device.displayWheel) {
					surfaceManifest.stylePresets.wheel = {
						bitmap: {
							w: device.displayWheel.width,
							h: device.displayWheel.height,
						},
					}
					surfaceManifest.controls[control.id] = { row, column, stylePreset: 'wheel' }
				}
				break
			case 'lcd-segment':
				// Ignore for now
				break
			default:
				assertNever(control)
				break
		}
	}

	return {
		brightness: true,
		surfaceManifest,
		pincodeMap: Pincode5x3(1),
	}
}

class LoupedeckWrapper implements SurfaceInstance {
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

		this.#deck.on('down', (control) => {
			context.keyDownById(control.id)
		})
		this.#deck.on('up', (control) => {
			context.keyUpById(control.id)
		})
		this.#deck.on('rotate', (control, delta) => {
			if (delta < 0) {
				context.rotateLeftById(control.id)
			} else if (delta > 0) {
				context.rotateRightById(control.id)
			}
		})
		this.#deck.on('touchstart', (data) => {
			for (const touch of data.changedTouches) {
				if (touch.target.control !== undefined) {
					context.keyDownById(touch.target.control.id)
				} else if (touch.target.screen == LoupedeckDisplayId.Wheel) {
					const wheelControl = this.#deck.controls.find((c) => c.type === 'wheel')
					if (wheelControl) context.keyDownById(wheelControl.id)
				}
			}
		})
		this.#deck.on('touchend', (data) => {
			for (const touch of data.changedTouches) {
				if (touch.target.control !== undefined) {
					context.keyUpById(touch.target.control.id)
				} else if (touch.target.screen == LoupedeckDisplayId.Wheel) {
					const wheelControl = this.#deck.controls.find((c) => c.type === 'wheel')
					if (wheelControl) context.keyUpById(wheelControl.id)
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
	async draw(_signal: AbortSignal, d: DeviceDrawProps): Promise<void> {
		const control = this.#deck.controls.find((c) => c.id === d.controlId)
		if (!control) return

		if (control.type === 'button') {
			if (control.feedbackType === 'rgb') {
				const color = parseColor(d.color)

				await this.#deck.setButtonColor({
					id: d.controlId,
					red: color.r,
					green: color.g,
					blue: color.b,
				})
			} else if (control.feedbackType === 'lcd') {
				if (d.image) {
					const buffer = await d.image(this.#deck.lcdKeySize, this.#deck.lcdKeySize, 'rgb')
					await this.#deck.drawKeyBuffer(d.controlId, buffer, LoupedeckBufferFormat.RGB)
				} else {
					throw new Error(`Cannot draw for Loupedeck without image`)
				}
			}
		} else if (control.type === 'wheel') {
			if (!this.#deck.displayWheel) return

			const width = this.#deck.displayWheel.width
			const height = this.#deck.displayWheel.height

			if (d.image) {
				const buffer = await d.image(width, height, 'rgb')
				await this.#deck.drawBuffer(
					LoupedeckDisplayId.Wheel,
					buffer,
					LoupedeckBufferFormat.RGB,
					width,
					height,
					0,
					0,
				)
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
