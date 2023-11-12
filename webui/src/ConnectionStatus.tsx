import type { ApiStatusResponse } from '../../src/rest'
import { useFetchInterval } from './Util/useFetchInterval'

const POLL_INTERVAL = 2000

export function ConnectionStatus() {
	const apiStatus = useFetchInterval<ApiStatusResponse>(POLL_INTERVAL, '/api/status')

	return (
		<>
			<h3>Status</h3>

			{apiStatus.data ? (
				<ConnectionStatusData status={apiStatus.data} />
			) : (
				<p>Unknown status {apiStatus.error?.toString() ?? ''}</p>
			)}
		</>
	)
}

interface ConnectionStatusDataProps {
	status: ApiStatusResponse
}
function ConnectionStatusData({ status }: ConnectionStatusDataProps) {
	if (status.connected) {
		return <p>Connected to Companion {status.companionVersion}</p>
	} else {
		return <p>Connecting...</p>
	}
}
