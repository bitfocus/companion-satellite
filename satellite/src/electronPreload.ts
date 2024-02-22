import { contextBridge, ipcRenderer } from 'electron'
import type { ApiConfigData, ApiStatusResponse } from './apiTypes'

export const electronApi = {
	rescanSurfaces: (): void => ipcRenderer.send('rescan'),
	getStatus: async (): Promise<ApiStatusResponse> => ipcRenderer.invoke('getStatus'),
	getConfig: async (): Promise<ApiConfigData> => ipcRenderer.invoke('getConfig'),
	saveConfig: async (newConfig: Partial<ApiConfigData>): Promise<ApiConfigData> =>
		ipcRenderer.invoke('saveConfig', newConfig),
}

contextBridge.exposeInMainWorld('electronApi', electronApi)
