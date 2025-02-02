import { useSatelliteApi } from '@/Api/Context'
import { BeatLoader } from 'react-spinners'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function SurfacesRescan({ className }: { className?: string }): JSX.Element {
	const api = useSatelliteApi()

	const [running, setRunning] = useState(false)

	const doRescan = () => {
		setRunning(true)

		api
			.rescanSurfaces()
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
