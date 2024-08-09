import Conf from 'conf'
import { CompanionSatelliteClient } from './client.js'
import { SatelliteConfig } from './config.js'

export interface ApiStatusResponse {
	connected: boolean
	companionVersion: string | null
	companionApiVersion: string | null
}

export interface ApiConfigData {
	host: string
	port: number

	installationName: string

	httpEnabled: boolean
	httpPort: number

	mdnsEnabled: boolean
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

export function updateConfig(appConfig: Conf<SatelliteConfig>, newConfig: Partial<ApiConfigData>): void {
	if (newConfig.host !== undefined) appConfig.set('remoteIp', newConfig.host)
	if (newConfig.port !== undefined) appConfig.set('remotePort', newConfig.port)

	if (newConfig.httpEnabled !== undefined) appConfig.set('restEnabled', newConfig.httpEnabled)
	if (newConfig.httpPort !== undefined) appConfig.set('restPort', newConfig.httpPort)

	if (newConfig.mdnsEnabled !== undefined) appConfig.set('mdnsEnabled', newConfig.mdnsEnabled)
	if (newConfig.installationName !== undefined) appConfig.set('installationName', newConfig.installationName)
}
