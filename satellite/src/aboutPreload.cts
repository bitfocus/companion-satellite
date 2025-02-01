/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require('electron')

const aboutApi = {
	getVersion: async (): Promise<string> => ipcRenderer.invoke('getVersion'),
	openShell: async (url: string): Promise<void> => ipcRenderer.invoke('openShell', url),
}

contextBridge.exposeInMainWorld('aboutApi', aboutApi)

export type { aboutApi }
