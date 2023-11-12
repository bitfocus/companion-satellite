import Container from 'react-bootstrap/Container'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import { SatelliteHeader } from './Header'
import { SettingsForm } from './SettingsForm'
import { ConnectionStatus } from './ConnectionStatus'
import { MyErrorBoundary } from './Util/ErrorBoundary'
import { useRestConfigApi } from './Api/rest'
import { useCallback } from 'react'
import { useFetchInterval } from './Util/useFetchInterval'
import type { ApiStatusResponse } from '../../src/apiTypes'

const STATUS_POLL_INTERVAL = 2000

export function WebApp() {
	const restApi = useRestConfigApi()

	const apiStatus = useFetchInterval<ApiStatusResponse>(STATUS_POLL_INTERVAL, '/api/status')

	const rescanSurfaces = useCallback(() => {
		fetch('/api/rescan', {
			method: 'POST',
		})
			.then(() => {
				console.log('scan success')
			})
			.catch((e) => {
				console.error('scan failed', e)
			})
	}, [])

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
							<SettingsForm {...restApi} includeApiEnable={false} />
						</MyErrorBoundary>
					</Col>
				</Row>
			</Container>
		</>
	)
}
