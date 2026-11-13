import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConnectionTab } from './ConnectionTab'
import { ConnectedSurfacesTab } from './ConnectedSurfacesTab'
import { SurfacePluginsTab } from './SurfacePluginsTab'
import { AboutTab } from './AboutTab'
import { UpdateNotice } from './UpdateNotice'
import { MyErrorBoundary } from '@/Util/ErrorBoundary'
import { JSX, useEffect, useState } from 'react'

const queryClient = new QueryClient()

const TABS = ['connection', 'connected-surfaces', 'surface-plugins', 'about']
const DEFAULT_TAB = 'connection'

function getTabFromHash(): string {
	const tab = window.location.hash.slice(1)
	return TABS.includes(tab) ? tab : DEFAULT_TAB
}

/**
 * @param hasPageHeader Whether the page already shows the app name and version above this
 */
export function AppContent({ hasPageHeader }: { hasPageHeader: boolean }): JSX.Element {
	// The tab is reflected in the url hash, so that the desktop app can open a specific tab (eg about from the tray)
	const [tab, setTab] = useState(getTabFromHash)
	useEffect(() => {
		const onHashChange = () => setTab(getTabFromHash())
		window.addEventListener('hashchange', onHashChange)
		return () => window.removeEventListener('hashchange', onHashChange)
	}, [])

	const changeTab = (newTab: string) => {
		setTab(newTab)
		// Replace rather than push, so the tabs don't fill the history, and so this doesn't fire hashchange
		window.history.replaceState(null, '', `#${newTab}`)
	}

	return (
		<QueryClientProvider client={queryClient}>
			<Tabs value={tab} onValueChange={(value) => changeTab(String(value))}>
				<CardHeader className="text-center pb-3">
					<MyErrorBoundary>
						<UpdateNotice />
					</MyErrorBoundary>
					<TabsList className="flex-col sm:flex-row h-auto sm:h-9 w-full">
						<TabsTrigger className="w-full sm:w-auto sm:flex-auto" value="connection">
							Connection
						</TabsTrigger>
						<TabsTrigger className="w-full sm:w-auto sm:flex-auto" value="connected-surfaces">
							Connected Surfaces
						</TabsTrigger>
						<TabsTrigger className="w-full sm:w-auto sm:flex-auto" value="surface-plugins">
							Surface Plugins
						</TabsTrigger>
						<TabsTrigger className="w-full sm:w-auto sm:flex-auto" value="about">
							About
						</TabsTrigger>
					</TabsList>
				</CardHeader>
				<CardContent>
					<TabsContent value="connection">
						<ConnectionTab />
					</TabsContent>
					<TabsContent value="connected-surfaces">
						<ConnectedSurfacesTab />
					</TabsContent>
					<TabsContent value="surface-plugins">
						<SurfacePluginsTab />
					</TabsContent>
					<TabsContent value="about">
						<MyErrorBoundary>
							<AboutTab showBranding={!hasPageHeader} />
						</MyErrorBoundary>
					</TabsContent>
				</CardContent>
			</Tabs>
		</QueryClientProvider>
	)
}
