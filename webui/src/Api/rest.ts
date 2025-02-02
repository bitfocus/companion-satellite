import type { SatelliteUiApi, ApiConfigData, ApiStatusResponse, ApiConfigDataUpdate, ApiSurfaceInfo } from './types'
import type { paths } from '../../../satellite/src/generated/openapi'
import createClient from 'openapi-fetch'

const client = createClient<paths>({ baseUrl: '/api/' })

export const SatelliteRestApi: SatelliteUiApi = {
	includeApiEnable: false,
	getStatus: async function (): Promise<ApiStatusResponse> {
		const { data, error } = await client.GET('/status', {})
		if (error) throw new Error(error.error)
		return data
	},
	getConfig: async function (): Promise<ApiConfigData> {
		const { data, error } = await client.GET('/config', {})
		if (error) throw new Error(error.error)
		return data
	},
	saveConfig: async function (newConfig: ApiConfigDataUpdate): Promise<ApiConfigData> {
		const { data, error } = await client.POST('/config', {
			body: newConfig,
		})
		if (error) throw new Error(error.error)
		return data
	},
	rescanSurfaces: async function (): Promise<void> {
		const { data, error } = await client.POST('/surfaces/rescan', {})
		if (error) throw new Error(error.error)
		return data
	},
	connectedSurfaces: async function (): Promise<ApiSurfaceInfo[]> {
		const { data, error } = await client.GET('/surfaces', {})
		if (error) throw new Error(error.error)
		return data
	},
}
