import type {
	SatelliteUiApi,
	ApiConfigData,
	ApiStatusResponse,
	ApiConfigDataUpdate,
	ApiSurfaceInfo,
	ApiSurfacePluginInfo,
	ApiSurfacePluginsEnabled,
	ApiModulesAvailableResponse,
	ApiModulesInstalledResponse,
	ApiModulesUpdatesResponse,
} from './types'
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
	surfacePlugins: async function (): Promise<ApiSurfacePluginInfo[]> {
		const { data, error } = await client.GET('/surfaces/plugins/installed', {})
		if (error) throw new Error(error.error)
		return data
	},
	surfacePluginsEnabled: async function (): Promise<ApiSurfacePluginsEnabled> {
		const { data, error } = await client.GET('/surfaces/plugins/enabled', {})
		if (error) throw new Error(error.error)
		return data
	},
	surfacePluginsEnabledUpdate: async function (
		newConfig: ApiSurfacePluginsEnabled,
	): Promise<ApiSurfacePluginsEnabled> {
		const { data, error } = await client.POST('/surfaces/plugins/enabled', {
			body: newConfig,
		})
		if (error) throw new Error(error.error)
		return data
	},
	modulesAvailable: async function (): Promise<ApiModulesAvailableResponse> {
		const { data, error } = await client.GET('/modules/available', {})
		if (error) throw new Error(error.error)
		return data
	},
	modulesInstalled: async function (): Promise<ApiModulesInstalledResponse> {
		const { data, error } = await client.GET('/modules/installed', {})
		if (error) throw new Error(error.error)
		return data
	},
	modulesUpdates: async function (): Promise<ApiModulesUpdatesResponse> {
		const { data, error } = await client.GET('/modules/updates', {})
		if (error) throw new Error(error.error)
		return data
	},
	installModule: async function (moduleId: string, version?: string): Promise<{ success: boolean; error?: string }> {
		const { data, error } = await client.POST('/modules/install', {
			body: { moduleId, version },
		})
		if (error) throw new Error(error.error)
		return data
	},
}
