import type { ApiStatusResponse } from '../../satellite/src/apiTypes'

interface ConnectionStatusProps {
	status: ApiStatusResponse | undefined
	error: Error | undefined
}

export function ConnectionStatus({ status, error }: ConnectionStatusProps): JSX.Element {
	return (
		<>
			<h3>Status</h3>

			{status ? <ConnectionStatusData status={status} /> : <p>Unknown status {error?.toString() ?? ''}</p>}
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
