import { MyErrorBoundary } from '@/Util/ErrorBoundary'
import { ConnectionStatus } from './ConnectionStatus'
import { ConnectionConfig } from './ConnectionConfig'

export function ConnectionTab(): JSX.Element {
	return (
		<div>
			<MyErrorBoundary>
				<ConnectionStatus />
			</MyErrorBoundary>

			<hr className="my-4" />

			<MyErrorBoundary>
				<ConnectionConfig />
			</MyErrorBoundary>
		</div>
	)
}
