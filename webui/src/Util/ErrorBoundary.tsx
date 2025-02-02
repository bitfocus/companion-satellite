import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { PropsWithChildren } from 'react'
import { ErrorBoundary, FallbackProps } from 'react-error-boundary'

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
	return (
		<Alert variant="destructive">
			<p>Something went wrong:</p>
			<pre>{error?.message ?? ''}</pre>
			<Button className="mt-2" variant="outline" size="sm" onClick={resetErrorBoundary}>
				Try again
			</Button>
		</Alert>
	)
}

export function MyErrorBoundary({ children }: PropsWithChildren): JSX.Element {
	return <ErrorBoundary FallbackComponent={ErrorFallback}>{children}</ErrorBoundary>
}
