import { useCallback, useEffect, useState } from 'react'
import type { SaveApiConfigData } from './types'
import { useFetchInterval } from '../Util/useFetchInterval'
import type { ApiConfigData } from '../../../src/apiTypes'

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

	const loadData = useFetchInterval<ApiConfigData>(POLL_INTERVAL, '/api/config')
	useEffect(() => {
		if (loadData.data) {
			setCurrentConfig(loadData.data)
		}
	}, [loadData.data])

	return {
		currentConfig,
		loadError: loadData.error ?? null,
		saveConfig,
	}
}
