import { useSatelliteApi } from '@/Api/Context'
import type { ApiStatusResponse } from '../Api/types.js'
import { useQuery } from '@tanstack/react-query'
import { BarLoader } from 'react-spinners'
import { CONNECTION_STATUS_QUERY_KEY } from './constants'

export function ConnectionStatus(): JSX.Element {
	const api = useSatelliteApi()
	const status = useQuery({ queryKey: [CONNECTION_STATUS_QUERY_KEY], queryFn: api.getStatus, refetchInterval: 2000 })

	return (
		<>
			<h3 className="text-2xl font-bold dark:text-white">Status</h3>

			{status.isLoading ? <BarLoader color="#ffffff" className="mt-4" /> : null}
			{status.error ? <p>Error: {status.error.toString()}</p> : null}
			{status.data ? <ConnectionStatusData status={status.data} /> : null}
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
