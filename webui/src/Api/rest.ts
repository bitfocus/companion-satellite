import type { SatelliteUiApi, ApiConfigData, ApiStatusResponse } from './types'

export const SatelliteRestApi: SatelliteUiApi = {
	includeApiEnable: false,
	getStatus: async function (): Promise<ApiStatusResponse> {
		return fetch('/api/status').then(async (res) => res.json())
	},
	getConfig: async function (): Promise<ApiConfigData> {
		return fetch('/api/config').then(async (res) => res.json())
	},
	saveConfig: async function (newConfig: Partial<ApiConfigData>): Promise<ApiConfigData> {
		const res = await fetch('/api/config', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(newConfig),
		})
		console.log('config saved')

		return await res.json()
	},
	rescanSurfaces: async function (): Promise<void> {
		await fetch('/api/rescan', {
			method: 'POST',
		})
	},
}
