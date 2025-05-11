import {
	listLoupedecks,
	LoupedeckDevice,
	LoupedeckModelId,
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
} from './api.js'
import { compileLoupedeckLiveProps, LoupedeckLiveWrapper } from './loupedeck-live.js'
import { assertNever } from '../lib.js'
import { compileLoupedeckLiveSProps, LoupedeckLiveSWrapper } from './loupedeck-live-s.js'
import { compileRazerStreamControllerXProps, RazerStreamControllerXWrapper } from './razer-stream-controller-x.js'

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
		let factory: new (deviceId: string, device: LoupedeckDevice, context: SurfaceContext) => SurfaceInstance
		let propsFactory: (device: LoupedeckDevice) => DeviceRegisterProps

		switch (pluginInfo.model) {
			case LoupedeckModelId.LoupedeckLive:
			case LoupedeckModelId.RazerStreamController:
				factory = LoupedeckLiveWrapper
				propsFactory = compileLoupedeckLiveProps
				break
			case LoupedeckModelId.LoupedeckLiveS:
				factory = LoupedeckLiveSWrapper
				propsFactory = compileLoupedeckLiveSProps
				break
			case LoupedeckModelId.RazerStreamControllerX:
				factory = RazerStreamControllerXWrapper
				propsFactory = compileRazerStreamControllerXProps
				break
			case LoupedeckModelId.LoupedeckCt:
			case LoupedeckModelId.LoupedeckCtV1:
				throw new Error('Unsupported model')
			default:
				assertNever(pluginInfo.model)
				throw new Error('Unsupported model')
		}

		const loupedeck = await openLoupedeck(pluginInfo.path)
		return {
			surface: new factory(surfaceId, loupedeck, context),
			registerProps: propsFactory(loupedeck),
		}
	}
}
