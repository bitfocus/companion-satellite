/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require('electron')
// @ts-expect-error weird interop between cjs and mjs
import type { ApiConfigData, ApiConfigDataUpdateElectron, ApiStatusResponse, SatelliteUiApi } from './apiTypes.js'

const electronApi: SatelliteUiApi = {
	includeApiEnable: true,
	rescanSurfaces: async (): Promise<void> => ipcRenderer.send('rescan'),
	getStatus: async (): Promise<ApiStatusResponse> => ipcRenderer.invoke('getStatus'),
	getConfig: async (): Promise<ApiConfigData> => ipcRenderer.invoke('getConfig'),
	saveConfig: async (newConfig: ApiConfigDataUpdateElectron): Promise<ApiConfigData> =>
		ipcRenderer.invoke('saveConfig', newConfig),
}

contextBridge.exposeInMainWorld('electronApi', electronApi)

export type { electronApi }
