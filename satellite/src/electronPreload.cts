/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require('electron')
import type {
	ApiConfigData,
	ApiConfigDataUpdateElectron,
	ApiStatusResponse,
	ApiSurfaceInfo,
	ApiSurfacePluginInfo,
	ApiSurfacePluginsEnabled,
	ApiUpdateInfo,
	ApiUsageStatisticsPayload,
	SatelliteUiApi,
} from './apiTypes.js'

const electronApi: SatelliteUiApi = {
	includeApiEnable: true,
	rescanSurfaces: async (): Promise<void> => ipcRenderer.send('rescan'),
	getStatus: async (): Promise<ApiStatusResponse> => ipcRenderer.invoke('getStatus'),
	getConfig: async (): Promise<ApiConfigData> => ipcRenderer.invoke('getConfig'),
	saveConfig: async (newConfig: ApiConfigDataUpdateElectron): Promise<ApiConfigData> =>
		ipcRenderer.invoke('saveConfig', newConfig),
	connectedSurfaces: async (): Promise<ApiSurfaceInfo[]> => ipcRenderer.invoke('connectedSurfaces'),
	surfacePlugins: async (): Promise<ApiSurfacePluginInfo[]> => ipcRenderer.invoke('surfacePlugins'),
	surfacePluginsEnabled: async (): Promise<ApiSurfacePluginsEnabled> => ipcRenderer.invoke('surfacePluginsEnabled'),
	surfacePluginsEnabledUpdate: async (newConfig: ApiSurfacePluginsEnabled): Promise<ApiSurfacePluginsEnabled> =>
		ipcRenderer.invoke('surfacePluginsEnabledUpdate', newConfig),
	getUpdateInfo: async (): Promise<ApiUpdateInfo | null> => ipcRenderer.invoke('getUpdateInfo'),
	dismissUpdateInfo: async (): Promise<void> => ipcRenderer.invoke('dismissUpdateInfo'),
	getUsageStatistics: async (): Promise<ApiUsageStatisticsPayload> => ipcRenderer.invoke('getUsageStatistics'),
}

contextBridge.exposeInMainWorld('electronApi', electronApi)

export type { electronApi }
