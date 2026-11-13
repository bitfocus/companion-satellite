import { useQuery } from '@tanstack/react-query'
import { useSatelliteApi } from '@/Api/Context'
import { buttonVariants } from '@/components/ui/button'
import { Bug, Download, Globe } from 'lucide-react'
import { JSX } from 'react'
import { UPDATE_INFO_QUERY_KEY } from './constants'

const WEBSITE_URL = 'https://companion.free/satellite/'
const DOWNLOAD_URL = 'https://bitfocus.io/account/downloads?satellite_inapp_about'
const ISSUES_URL = 'https://github.com/bitfocus/companion-satellite/issues'
const SOURCE_URL = 'https://github.com/bitfocus/companion-satellite'

export function AboutTab({ showBranding }: { showBranding: boolean }): JSX.Element {
	return (
		<div className="flex flex-col items-center gap-4 py-4 text-center">
			{showBranding ? (
				<>
					<img src="icon.png" alt="" className="size-24" />

					<div className="flex flex-col items-center gap-1">
						<h2 className="text-lg font-medium">Companion Satellite</h2>
						<span className="text-xs bg-muted-foreground/10 text-muted-foreground px-2 py-1 rounded-full">
							v{__APP_VERSION__}
						</span>
					</div>
				</>
			) : null}

			<p className="text-muted-foreground">
				Connects your USB surfaces to Bitfocus Companion over the network.
				<br />
				Works with Companion 3.4 and newer.
			</p>

			<UpdateStatus />

			<div className="flex flex-wrap justify-center gap-2">
				<a href={WEBSITE_URL} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline' })}>
					<Globe data-icon="inline-start" />
					Website
				</a>
				<a href={DOWNLOAD_URL} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline' })}>
					<Download data-icon="inline-start" />
					Downloads
				</a>
				<a href={ISSUES_URL} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline' })}>
					<Bug data-icon="inline-start" />
					Report an issue
				</a>
			</div>

			<p className="text-xs text-muted-foreground">
				Copyright {new Date().getFullYear()} Julian Waller. Distributed under the MIT license.
				<br />
				<a
					href={SOURCE_URL}
					target="_blank"
					rel="noreferrer"
					className="underline underline-offset-3 hover:text-foreground"
				>
					Source code
				</a>
			</p>
		</div>
	)
}

function UpdateStatus(): JSX.Element | null {
	const api = useSatelliteApi()
	const updateInfo = useQuery({ queryKey: [UPDATE_INFO_QUERY_KEY], queryFn: api.getUpdateInfo, refetchInterval: 60000 })

	const info = updateInfo.data
	switch (info?.type) {
		case 'update':
			return (
				<p className="font-medium">
					{info.message}{' '}
					{info.link ? (
						<a href={info.link} target="_blank" rel="noreferrer" className="underline underline-offset-3">
							Download v{info.version}
						</a>
					) : null}
				</p>
			)
		case 'beta':
			return <p className="text-muted-foreground">This is a beta build</p>
		default:
			// Nothing to say, or the check hasn't happened. Don't claim to be up to date when that isn't known
			return null
	}
}
