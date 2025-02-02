import Conf from 'conf'
import { CompanionSatelliteClient } from './client.js'
import { SatelliteConfig, SatelliteConfigInstance } from './config.js'
import type { components as openapiComponents } from './generated/openapi.js'

export type ApiStatusResponse = openapiComponents['schemas']['StatusResponse']
export type ApiConfigData = openapiComponents['schemas']['ConfigData']
export type ApiConfigDataUpdate = openapiComponents['schemas']['ConfigDataUpdate']
export type ApiSurfaceInfo = openapiComponents['schemas']['SurfaceInfo']
export type ApiSurfacePluginInfo = openapiComponents['schemas']['SurfacePluginInfo']
export type ApiSurfacePluginsEnabled = Record<string, boolean>

export type ApiConfigDataUpdateElectron = ApiConfigDataUpdate & Pick<Partial<ApiConfigData>, 'httpEnabled' | 'httpPort'>

export interface SatelliteUiApi {
	includeApiEnable: boolean
	getConfig: () => Promise<ApiConfigData>
	saveConfig: (newConfig: ApiConfigDataUpdate) => Promise<ApiConfigData>
	getStatus: () => Promise<ApiStatusResponse>
	rescanSurfaces: () => Promise<void>
	connectedSurfaces: () => Promise<ApiSurfaceInfo[]>
	surfacePlugins: () => Promise<ApiSurfacePluginInfo[]>
	surfacePluginsEnabled: () => Promise<ApiSurfacePluginsEnabled>
	surfacePluginsEnabledUpdate: (newConfig: ApiSurfacePluginsEnabled) => Promise<ApiSurfacePluginsEnabled>
}

export function compileStatus(client: CompanionSatelliteClient): ApiStatusResponse {
	return {
		connected: client.connected,
		companionVersion: client.companionVersion,
		companionApiVersion: client.companionApiVersion,
		companionUnsupportedApi: client.companionUnsupported,
	}
}

export function compileConfig(appConfig: Conf<SatelliteConfig>): ApiConfigData {
	return {
		protocol: appConfig.get('remoteProtocol'),
		host: appConfig.get('remoteIp'),
		port: appConfig.get('remotePort'),
		wsAddress: appConfig.get('remoteWsAddress'),

		installationName: appConfig.get('installationName'),

		httpEnabled: appConfig.get('restEnabled'),
		httpPort: appConfig.get('restPort'),

		mdnsEnabled: appConfig.get('mdnsEnabled'),
	}
}

export function updateConfig(appConfig: SatelliteConfigInstance, newConfig: ApiConfigDataUpdateElectron): void {
	if (newConfig.protocol !== undefined) appConfig.set('remoteProtocol', newConfig.protocol)
	if (newConfig.host !== undefined) appConfig.set('remoteIp', newConfig.host)
	if (newConfig.port !== undefined) appConfig.set('remotePort', newConfig.port)
	if (newConfig.wsAddress !== undefined) appConfig.set('remoteWsAddress', newConfig.wsAddress)

	if (newConfig.httpEnabled !== undefined) appConfig.set('restEnabled', newConfig.httpEnabled)
	if (newConfig.httpPort !== undefined) appConfig.set('restPort', newConfig.httpPort)

	if (newConfig.mdnsEnabled !== undefined) appConfig.set('mdnsEnabled', newConfig.mdnsEnabled)
	if (newConfig.installationName !== undefined) appConfig.set('installationName', newConfig.installationName)
}

export function updateSurfacePluginsEnabledConfig(
	appConfig: SatelliteConfigInstance,
	newConfig: ApiSurfacePluginsEnabled,
): void {
	for (const [pluginId, enabled] of Object.entries(newConfig)) {
		appConfig.set(`surfacePluginsEnabled.${pluginId}`, !!enabled)
	}

	console.log('Updated surfacePluginsEnabled:', appConfig.get('surfacePluginsEnabled'))
}
