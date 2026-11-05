import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSatelliteApi } from '@/Api/Context'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Info, X } from 'lucide-react'
import { JSX } from 'react'
import { UPDATE_INFO_QUERY_KEY } from './constants'

export function UpdateNotice(): JSX.Element | null {
	const api = useSatelliteApi()
	const queryClient = useQueryClient()

	const updateInfo = useQuery({ queryKey: [UPDATE_INFO_QUERY_KEY], queryFn: api.getUpdateInfo, refetchInterval: 60000 })
	const dismiss = useMutation({
		mutationFn: api.dismissUpdateInfo,
		onSettled: async () => queryClient.invalidateQueries({ queryKey: [UPDATE_INFO_QUERY_KEY] }),
	})

	const info = updateInfo.data
	if (!info) return null

	const downloadLink = info.link ? (
		<a href={info.link} target="_blank" rel="noreferrer">
			Download
		</a>
	) : null

	if (info.dismissed) {
		// Keep it visible, but out of the way
		return (
			<p className="text-sm text-muted-foreground text-center px-6 pt-4 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground">
				{info.message} {downloadLink}
			</p>
		)
	}

	return (
		<div className="px-6 pt-4">
			<Alert>
				<Info />
				<AlertTitle>{info.message}</AlertTitle>
				{info.message2 || downloadLink ? (
					<AlertDescription>
						{info.message2 ? <p>{info.message2}</p> : null}
						{downloadLink ? <p>{downloadLink}</p> : null}
					</AlertDescription>
				) : null}
				<AlertAction>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Dismiss"
						disabled={dismiss.isPending}
						onClick={() => dismiss.mutate()}
					>
						<X />
					</Button>
				</AlertAction>
			</Alert>
		</div>
	)
}
