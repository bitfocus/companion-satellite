import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConnectionTab } from './ConnectionTab'
import { ConnectedSurfacesTab } from './ConnectedSurfacesTab'

const queryClient = new QueryClient()

export function AppContent(): JSX.Element {
	return (
		<QueryClientProvider client={queryClient}>
			<Tabs defaultValue="connection">
				<CardHeader className="text-center pb-3">
					<TabsList>
						<TabsTrigger value="connection">Connection</TabsTrigger>
						<TabsTrigger value="connected-surfaces">Connected Surfaces</TabsTrigger>
					</TabsList>
				</CardHeader>
				<CardContent>
					<TabsContent value="connection">
						<ConnectionTab />
					</TabsContent>
					<TabsContent value="connected-surfaces">
						<ConnectedSurfacesTab />
					</TabsContent>
				</CardContent>
			</Tabs>
		</QueryClientProvider>
	)
}
