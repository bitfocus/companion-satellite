import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSatelliteApi } from '@/Api/Context'
import { Button, buttonVariants } from '@/components/ui/button'
import { Download, Info, X } from 'lucide-react'
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

	if (info.dismissed) {
		// Keep it visible, but out of the way
		return (
			<p className="text-xs text-muted-foreground text-center mb-2">
				{info.message}
				{info.link ? (
					<>
						{' '}
						<a
							href={info.link}
							target="_blank"
							rel="noreferrer"
							className="underline underline-offset-3 hover:text-foreground"
						>
							Download
						</a>
					</>
				) : null}
			</p>
		)
	}

	return (
		<div role="status" className="flex items-center gap-3 rounded-lg border bg-muted/40 py-2 pl-3 pr-2 mb-2 text-left">
			<Info className="size-4 shrink-0 text-muted-foreground" />
			<div className="grow min-w-0">
				<div className="font-medium">{info.message}</div>
				{info.message2 ? <div className="text-muted-foreground">{info.message2}</div> : null}
			</div>
			{info.link ? (
				<a
					href={info.link}
					target="_blank"
					rel="noreferrer"
					className={buttonVariants({ variant: 'outline', size: 'sm' })}
				>
					<Download data-icon="inline-start" />
					Download
				</a>
			) : null}
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Dismiss"
				title="Don't show this again"
				disabled={dismiss.isPending}
				onClick={() => dismiss.mutate()}
			>
				<X />
			</Button>
		</div>
	)
}
