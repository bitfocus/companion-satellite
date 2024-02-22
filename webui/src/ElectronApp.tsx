import Container from 'react-bootstrap/Container'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import { SatelliteHeader } from './Header'
import { SettingsForm } from './SettingsForm'
import { ConnectionStatus } from './ConnectionStatus'
import { MyErrorBoundary } from './Util/ErrorBoundary'
import { useCallback } from 'react'
import { usePoller } from './Util/usePoller'
import type { ApiStatusResponse } from '../../satellite/src/apiTypes'
import { useIpcConfigApi } from './Api/ipc'

const STATUS_POLL_INTERVAL = 2000

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
							<SettingsForm {...restConfigApi} includeApiEnable={true} />
						</MyErrorBoundary>
					</Col>
				</Row>
			</Container>
		</>
	)
}
