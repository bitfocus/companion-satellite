import { MyErrorBoundary } from '@/Util/ErrorBoundary'
import { SurfacesRescan } from './SurfacesRescan'

export function SurfacesTab(): JSX.Element {
	return (
		<div>
			<MyErrorBoundary>
				<SurfacesRescan />
			</MyErrorBoundary>

			<hr className="my-4" />

			<p>More coming soon!</p>

			{/* <MyErrorBoundary>
				<ConnectionConfig />
			</MyErrorBoundary> */}
		</div>
	)
}
