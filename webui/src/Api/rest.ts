import { useCallback, useEffect, useState } from 'react'
import type { SaveApiConfigData } from './types'
import type { ApiConfigData } from '../../../satellite/src/apiTypes'
import { usePoller } from '../Util/usePoller'

const POLL_INTERVAL = 5000

export function useRestConfigApi(): {
	currentConfig: ApiConfigData | null
	loadError: Error | null
	saveConfig: SaveApiConfigData
} {
	const saveConfig = useCallback(async (config: Partial<ApiConfigData>): Promise<void> => {
		const res = await fetch('/api/config', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(config),
		})
		console.log('config saved')

		const json = await res.json()
		setCurrentConfig(json)
	}, [])

	const [currentConfig, setCurrentConfig] = useState<ApiConfigData | null>(null)

	const fetchConfig = useCallback(async () => {
		const response = await fetch('/api/config')
		if (!response.ok) {
			throw new Error(response.statusText)
		}

		return (await response.json()) as ApiConfigData
	}, [])
	const loadedConfig = usePoller<ApiConfigData>(POLL_INTERVAL, fetchConfig)
	useEffect(() => {
		if (loadedConfig.data) {
			setCurrentConfig(loadedConfig.data)
		}
	}, [loadedConfig.data])

	return {
		currentConfig,
		loadError: loadedConfig.error ?? null,
		saveConfig,
	}
}
