import Container from 'react-bootstrap/Container'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import { SatelliteHeader } from './Header'
import { SettingsForm } from './SettingsForm'
import { ConnectionStatus } from './ConnectionStatus'
import { MyErrorBoundary } from './Util/ErrorBoundary'
import { useCallback, useEffect, useState } from 'react'
import { usePoller } from './Util/usePoller'
import type { ApiConfigData, ApiStatusResponse } from '../../src/apiTypes'
import { SaveApiConfigData } from './Api/types'

const STATUS_POLL_INTERVAL = 2000
const CONFIG_POLL_INTERVAL = 5000

function useIpcConfigApi(): {
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

export function ElectronApp() {
	const restConfigApi = useIpcConfigApi()

	const getStatusFn = useCallback(async () => electronApi.getStatus(), [])
	const apiStatus = usePoller<ApiStatusResponse>(STATUS_POLL_INTERVAL, getStatusFn)

	const rescanSurfaces = useCallback(() => electronApi.rescanSurfaces(), [])

	return (
		<>
			<SatelliteHeader rescanSurfaces={rescanSurfaces} />
			<Container>
				<Row>
					<Col>
						<MyErrorBoundary>
							<ConnectionStatus status={apiStatus.data} error={apiStatus.error} />
						</MyErrorBoundary>

						<MyErrorBoundary>
							<SettingsForm {...restConfigApi} />
						</MyErrorBoundary>
					</Col>
				</Row>
			</Container>
		</>
	)
}
