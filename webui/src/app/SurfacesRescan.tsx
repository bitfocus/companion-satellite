import { useSatelliteApi } from '@/Api/Context'
import { BeatLoader } from 'react-spinners'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useQueryClient } from '@tanstack/react-query'
import { CONNECTED_SURFACES_QUERY_KEY } from './constants'

export function SurfacesRescan({ className }: { className?: string }): JSX.Element {
	const api = useSatelliteApi()
	const queryClient = useQueryClient()

	const [running, setRunning] = useState(false)

	const doRescan = () => {
		setRunning(true)

		api
			.rescanSurfaces()
			.then(async () => {
				// Sleep to give the rescan time to complete
				await new Promise((resolve) => setTimeout(resolve, 1000))

				await queryClient.invalidateQueries({ queryKey: [CONNECTED_SURFACES_QUERY_KEY] })
			})
			.finally(() => {
				setRunning(false)
			})
			.catch((e) => {
				console.error('rescan failed', e)
			})
	}

	return (
		<>
			<Button onClick={doRescan} disabled={running} className={className}>
				{running ? <BeatLoader /> : 'Rescan'}
			</Button>
		</>
	)
}
