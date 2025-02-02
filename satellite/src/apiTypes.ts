import Conf from 'conf'
import { CompanionSatelliteClient } from './client.js'
import { SatelliteConfig } from './config.js'
import type { components as openapiComponents } from './generated/openapi.js'

export type ApiStatusResponse = openapiComponents['schemas']['ApiStatusResponse']
export type ApiConfigData = openapiComponents['schemas']['ApiConfigData']
export type ApiConfigDataUpdate = openapiComponents['schemas']['ApiConfigDataUpdate']

export type ApiConfigDataUpdateElectron = ApiConfigDataUpdate & Pick<Partial<ApiConfigData>, 'httpEnabled' | 'httpPort'>

export interface SatelliteUiApi {
	includeApiEnable: boolean
	getConfig: () => Promise<ApiConfigData>
	saveConfig: (newConfig: ApiConfigDataUpdate) => Promise<ApiConfigData>
	getStatus: () => Promise<ApiStatusResponse>
	rescanSurfaces: () => Promise<void>
}

export function compileStatus(client: CompanionSatelliteClient): ApiStatusResponse {
	return {
		connected: client.connected,
		companionVersion: client.companionVersion,
		companionApiVersion: client.companionApiVersion,
	}
}

export function compileConfig(appConfig: Conf<SatelliteConfig>): ApiConfigData {
	return {
		host: appConfig.get('remoteIp'),
		port: appConfig.get('remotePort'),

		installationName: appConfig.get('installationName'),

		httpEnabled: appConfig.get('restEnabled'),
		httpPort: appConfig.get('restPort'),

		mdnsEnabled: appConfig.get('mdnsEnabled'),
	}
}

export function updateConfig(appConfig: Conf<SatelliteConfig>, newConfig: ApiConfigDataUpdateElectron): void {
	if (newConfig.host !== undefined) appConfig.set('remoteIp', newConfig.host)
	if (newConfig.port !== undefined) appConfig.set('remotePort', newConfig.port)

	if (newConfig.httpEnabled !== undefined) appConfig.set('restEnabled', newConfig.httpEnabled)
	if (newConfig.httpPort !== undefined) appConfig.set('restPort', newConfig.httpPort)

	if (newConfig.mdnsEnabled !== undefined) appConfig.set('mdnsEnabled', newConfig.mdnsEnabled)
	if (newConfig.installationName !== undefined) appConfig.set('installationName', newConfig.installationName)
}
