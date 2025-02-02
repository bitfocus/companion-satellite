import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConnectionTab } from './ConnectionTab'
import { SurfacesTab } from './SurfacesTab'

const queryClient = new QueryClient()

export function AppContent(): JSX.Element {
	return (
		<QueryClientProvider client={queryClient}>
			<Tabs defaultValue="connection">
				<CardHeader className="text-center">
					<TabsList>
						<TabsTrigger value="connection">Connection</TabsTrigger>
						<TabsTrigger value="surfaces">Surfaces</TabsTrigger>
					</TabsList>
				</CardHeader>
				<CardContent>
					<TabsContent value="connection">
						<ConnectionTab />
					</TabsContent>
					<TabsContent value="surfaces">
						<SurfacesTab />
					</TabsContent>
				</CardContent>
			</Tabs>
		</QueryClientProvider>
	)
}
