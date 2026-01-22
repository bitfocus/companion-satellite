/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require('electron')
import type {
	ApiConfigData,
	ApiConfigDataUpdateElectron,
	ApiStatusResponse,
	ApiSurfaceInfo,
	ApiSurfacePluginInfo,
	ApiSurfacePluginsEnabled,
	ApiModulesAvailableResponse,
	ApiModulesInstalledResponse,
	ApiModulesUpdatesResponse,
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
	modulesAvailable: async (): Promise<ApiModulesAvailableResponse> => ipcRenderer.invoke('modulesAvailable'),
	modulesInstalled: async (): Promise<ApiModulesInstalledResponse> => ipcRenderer.invoke('modulesInstalled'),
	modulesUpdates: async (): Promise<ApiModulesUpdatesResponse> => ipcRenderer.invoke('modulesUpdates'),
	installModule: async (moduleId: string, version?: string): Promise<{ success: boolean; error?: string }> =>
		ipcRenderer.invoke('installModule', moduleId, version),
	uninstallModule: async (moduleId: string, version: string): Promise<{ success: boolean; error?: string }> =>
		ipcRenderer.invoke('uninstallModule', moduleId, version),
}

contextBridge.exposeInMainWorld('electronApi', electronApi)

export type { electronApi }
