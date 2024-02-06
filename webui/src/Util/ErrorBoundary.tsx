import { PropsWithChildren } from 'react'
import { ErrorBoundary, FallbackProps } from 'react-error-boundary'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
	return (
		<Alert variant={'danger'}>
			<p>Something went wrong:</p>
			<pre>{error?.message ?? ''}</pre>
			<Button color="primary" size="sm" onClick={resetErrorBoundary}>
				Try again
			</Button>
		</Alert>
	)
}

export function MyErrorBoundary({ children }: PropsWithChildren) {
	return <ErrorBoundary FallbackComponent={ErrorFallback}>{children}</ErrorBoundary>
}
