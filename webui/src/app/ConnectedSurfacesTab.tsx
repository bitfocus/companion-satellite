import { SurfacesRescan } from './SurfacesRescan'
import { useQuery } from '@tanstack/react-query'
import { useSatelliteApi } from '@/Api/Context'
import { ApiSurfaceInfo } from '@/Api/types'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell, TableCaption } from '@/components/ui/table'
import { BarLoader } from 'react-spinners'
import { CONNECTED_SURFACES_QUERY_KEY } from './constants'

export function ConnectedSurfacesTab(): JSX.Element {
	const api = useSatelliteApi()
	const connectedSurfaces = useQuery({
		queryKey: [CONNECTED_SURFACES_QUERY_KEY],
		queryFn: async () => api.connectedSurfaces(),
		refetchInterval: 5000,
	})

	return (
		<div>
			<h3 className="text-2xl font-bold dark:text-white">
				Connected Surfaces
				<SurfacesRescan className="ml-2 float-right" />
			</h3>

			{connectedSurfaces.isLoading ? <BarLoader color="#ffffff" className="mt-4" /> : null}
			{connectedSurfaces.error ? <p>Error: {connectedSurfaces.error.message.toString()}</p> : null}
			{connectedSurfaces.data && <ConnectedSurfacesList surfaces={connectedSurfaces.data} />}
		</div>
	)
}

function ConnectedSurfacesList({ surfaces }: { surfaces: ApiSurfaceInfo[] }): JSX.Element {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Name</TableHead>
					<TableHead>ID</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{surfaces.map((surface) => (
					<TableRow key={surface.surfaceId}>
						<TableCell>
							<span className="font-medium">{surface.productName}</span>
							<br />
							<span className="font-medium text-gray-500">{surface.pluginName}</span>
						</TableCell>
						<TableCell className="font-medium">{surface.surfaceId}</TableCell>
					</TableRow>
				))}
			</TableBody>
			<TableCaption>
				{surfaces.length === 0 && <p className="mb-4">No surfaces are connected</p>}
				You can enable and disable support for different surface types in the Surface Plugins tab.
			</TableCaption>
		</Table>
	)
}
