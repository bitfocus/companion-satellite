import Container from 'react-bootstrap/Container'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import { SatelliteHeader } from './Header.js'
import { SettingsForm } from './SettingsForm.js'
import { ConnectionStatus } from './ConnectionStatus.js'
import { MyErrorBoundary } from './Util/ErrorBoundary.js'
import { useRestConfigApi } from './Api/rest'
import { useCallback } from 'react'
import type { ApiStatusResponse } from '../../satellite/src/apiTypes'
import { usePoller } from './Util/usePoller'

const STATUS_POLL_INTERVAL = 2000

export function WebApp(): JSX.Element {
	const restApi = useRestConfigApi()

	const fetchStatus = useCallback(async () => {
		const response = await fetch('/api/status')
		if (!response.ok) {
			throw new Error(response.statusText)
		}

		return (await response.json()) as ApiStatusResponse
	}, [])
	const apiStatus = usePoller<ApiStatusResponse>(STATUS_POLL_INTERVAL, fetchStatus)

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
