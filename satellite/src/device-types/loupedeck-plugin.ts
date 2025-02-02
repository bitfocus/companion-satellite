import {
	listLoupedecks,
	LoupedeckDevice,
	LoupedeckModelId,
	openLoupedeck,
	type LoupedeckDeviceInfo,
} from '@loupedeck/node'
import type { SurfacePlugin, DiscoveredSurfaceInfo, WrappedSurface } from './api.js'
import type { CardGenerator } from '../cards.js'
import { LoupedeckLiveWrapper } from './loupedeck-live.js'
import { assertNever } from '../lib.js'
import { LoupedeckLiveSWrapper } from './loupedeck-live-s.js'
import { RazerStreamControllerXWrapper } from './razer-stream-controller-x.js'

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
		const devices = await listLoupedecks()

		const result: DiscoveredSurfaceInfo<LoupedeckDeviceInfo>[] = []
		for (const device of devices) {
			if (!device.serialNumber) continue

			result.push({
				surfaceId: device.serialNumber,
				description: device.model, // TODO: Better description
				pluginInfo: device,
			})
		}

		return result
	}

	openSurface = async (
		surfaceId: string,
		pluginInfo: LoupedeckDeviceInfo,
		cardGenerator: CardGenerator,
	): Promise<WrappedSurface> => {
		let factory: new (deviceId: string, device: LoupedeckDevice, cardGenerator: CardGenerator) => WrappedSurface

		switch (pluginInfo.model) {
			case LoupedeckModelId.LoupedeckLive:
			case LoupedeckModelId.RazerStreamController:
				factory = LoupedeckLiveWrapper
				break
			case LoupedeckModelId.LoupedeckLiveS:
				factory = LoupedeckLiveSWrapper
				break
			case LoupedeckModelId.RazerStreamControllerX:
				factory = RazerStreamControllerXWrapper
				break
			case LoupedeckModelId.LoupedeckCt:
			case LoupedeckModelId.LoupedeckCtV1:
				throw new Error('Unsupported model')
			default:
				assertNever(pluginInfo.model)
				throw new Error('Unsupported model')
		}

		const loupedeck = await openLoupedeck(pluginInfo.path)
		return new factory(surfaceId, loupedeck, cardGenerator)
	}
}
