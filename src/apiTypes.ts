import Conf from 'conf'
import { CompanionSatelliteClient } from './client'
import { SatelliteConfig } from './config'

export interface ApiStatusResponse {
	connected: boolean
	companionVersion: string | null
	companionApiVersion: string | null
}

export interface ApiConfigData {
	host: string
	port: number
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
	}
}

export function updateConfig(appConfig: Conf<SatelliteConfig>, newConfig: Partial<ApiConfigData>): void {
	if (newConfig.host !== undefined) appConfig.set('remoteIp', newConfig.host)
	if (newConfig.port !== undefined) appConfig.set('remotePort', newConfig.port)
}
