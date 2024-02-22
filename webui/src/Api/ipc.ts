import { useCallback, useState, useEffect } from 'react'
import { ApiConfigData } from '../../../satellite/src/apiTypes'
import { usePoller } from '../Util/usePoller'
import { SaveApiConfigData } from './types'

const CONFIG_POLL_INTERVAL = 5000

export function useIpcConfigApi(): {
	currentConfig: ApiConfigData | null
	loadError: Error | null
	saveConfig: SaveApiConfigData
} {
	const saveConfig = useCallback(async (config: Partial<ApiConfigData>): Promise<void> => {
		const newConfig = await electronApi.saveConfig(config)

		setCurrentConfig(newConfig)
	}, [])

	const [currentConfig, setCurrentConfig] = useState<ApiConfigData | null>(null)

	const getConfigFn = useCallback(async () => electronApi.getConfig(), [])
	const loadData = usePoller<ApiConfigData>(CONFIG_POLL_INTERVAL, getConfigFn)
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
