import { useSatelliteApi } from '@/Api/Context'
import type { ApiStatusResponse } from '../Api/types.js'
import { useQuery } from '@tanstack/react-query'
import { CONNECTION_STATUS_QUERY_KEY } from './constants'
import { JSX } from 'react'
import { CheckCircle2, Loader2, AlertCircle, AlertTriangle } from 'lucide-react'
import { NonIdealState } from '@/components/NonIdealState'

export function ConnectionStatus(): JSX.Element {
	const api = useSatelliteApi()
	const status = useQuery({ queryKey: [CONNECTION_STATUS_QUERY_KEY], queryFn: api.getStatus, refetchInterval: 2000 })

	return (
		<>
			{status.isLoading ? (
				<NonIdealState
					icon={Loader2}
					title="Loading..."
					iconClassName="h-12 w-12 text-blue-500 animate-spin"
					titleClassName="text-lg text-blue-600 dark:text-blue-400"
				/>
			) : null}
			{status.error ? (
				<NonIdealState
					icon={AlertTriangle}
					title="Error"
					description={status.error.toString()}
					iconClassName="h-12 w-12 text-red-500"
					titleClassName="text-lg text-red-600 dark:text-red-400"
				/>
			) : null}
			{status.data ? <ConnectionStatusData status={status.data} /> : null}
		</>
	)
}

interface ConnectionStatusDataProps {
	status: ApiStatusResponse
}
function ConnectionStatusData({ status }: ConnectionStatusDataProps) {
	if (status.companionUnsupportedApi) {
		return (
			<NonIdealState
				icon={AlertCircle}
				title="Incompatible Version"
				description={`Companion ${status.companionVersion ?? ''} is not supported`}
				iconClassName="h-12 w-12 text-red-500"
				titleClassName="text-lg text-red-600 dark:text-red-400"
			/>
		)
	} else if (status.connected) {
		return (
			<NonIdealState
				icon={CheckCircle2}
				title="Connected"
				description={`Companion ${status.companionVersion}`}
				iconClassName="h-12 w-12 text-green-500"
				titleClassName="text-lg text-green-600 dark:text-green-400"
			/>
		)
	} else {
		return (
			<NonIdealState
				icon={Loader2}
				title="Connecting..."
				description="Searching for Companion"
				iconClassName="h-12 w-12 text-blue-500 animate-spin"
				titleClassName="text-lg text-blue-600 dark:text-blue-400"
			/>
		)
	}
}
