import type {
	SatelliteUiApi,
	ApiConfigData,
	ApiStatusResponse,
	ApiConfigDataUpdate,
	ApiSurfaceInfo,
	ApiSurfacePluginInfo,
	ApiSurfacePluginsEnabled,
	ApiUpdateInfo,
	ApiUsageStatisticsPayload,
} from './types'
import { createClient, createConfig } from '../../../satellite/src/generated/SatelliteApi/client/index.js'
import {
	dismissUpdateInfo,
	getConfig,
	getConnectedSurfaces,
	getConnectionStatus,
	getSurfacePluginsEnabled,
	getSurfacePluginsInstalled,
	getUpdateInfo,
	getUsageStatistics,
	postSurfaceesScan,
	updateConfig,
	updateSurfacePluginsEnabled,
} from '../../../satellite/src/generated/SatelliteApi/index.js'

const client = createClient(createConfig({ baseUrl: '/api' }))
// Transport failures (eg network errors) have no response, rethrow them so they don't look like an error response
client.interceptors.error.use((error, response) => {
	if (!response) throw error instanceof Error ? error : new Error(String(error))
	return error
})

export const SatelliteRestApi: SatelliteUiApi = {
	includeApiEnable: false,
	getStatus: async function (): Promise<ApiStatusResponse> {
		const { data, error } = await getConnectionStatus({ client })
		if (error) throw new Error(error.error)
		return data
	},
	getConfig: async function (): Promise<ApiConfigData> {
		const { data, error } = await getConfig({ client })
		if (error) throw new Error(error.error)
		return data
	},
	saveConfig: async function (newConfig: ApiConfigDataUpdate): Promise<ApiConfigData> {
		const { data, error } = await updateConfig({ client, body: newConfig })
		if (error) throw new Error(error.error)
		return data
	},
	rescanSurfaces: async function (): Promise<void> {
		const { error } = await postSurfaceesScan({ client })
		if (error) throw new Error(error.error)
	},
	connectedSurfaces: async function (): Promise<ApiSurfaceInfo[]> {
		const { data, error } = await getConnectedSurfaces({ client })
		if (error) throw new Error(error.error)
		return data
	},
	surfacePlugins: async function (): Promise<ApiSurfacePluginInfo[]> {
		const { data, error } = await getSurfacePluginsInstalled({ client })
		if (error) throw new Error(error.error)
		return data
	},
	surfacePluginsEnabled: async function (): Promise<ApiSurfacePluginsEnabled> {
		const { data, error } = await getSurfacePluginsEnabled({ client })
		if (error) throw new Error(error.error)
		return data
	},
	surfacePluginsEnabledUpdate: async function (
		newConfig: ApiSurfacePluginsEnabled,
	): Promise<ApiSurfacePluginsEnabled> {
		const { data, error } = await updateSurfacePluginsEnabled({ client, body: newConfig })
		if (error) throw new Error(error.error)
		return data
	},
	getUpdateInfo: async function (): Promise<ApiUpdateInfo | null> {
		const { data, error } = await getUpdateInfo({ client })
		if (error) throw new Error(error.error)
		return data.info
	},
	dismissUpdateInfo: async function (): Promise<void> {
		const { error } = await dismissUpdateInfo({ client })
		if (error) throw new Error(error.error)
	},
	getUsageStatistics: async function (): Promise<ApiUsageStatisticsPayload> {
		const { data, error } = await getUsageStatistics({ client })
		if (error) throw new Error(error.error)
		return data
	},
}
