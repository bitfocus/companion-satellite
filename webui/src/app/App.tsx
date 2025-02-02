import { Card } from '@/components/ui/card'
import { AppContent } from './Content'

export function App(): JSX.Element {
	return (
		<div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
			<div className="flex w-full max-w-2xl flex-col gap-6 grow my-10">
				<a href="#" className="flex items-center gap-2 self-center font-medium text-3xl">
					<img src="/icon.png" alt="Companion Satellite" className="h-16 w-16 mr-1" />
					Companion Satellite
				</a>
				<Card className="grow">
					<AppContent />
				</Card>
			</div>
		</div>
	)
}
