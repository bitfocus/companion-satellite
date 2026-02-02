import type { LucideIcon } from 'lucide-react'
import { JSX, ReactNode } from 'react'

interface NonIdealStateProps {
	icon: LucideIcon
	title: string
	description?: string | ReactNode
	iconClassName?: string
	titleClassName?: string
	descriptionClassName?: string
	className?: string
}

export function NonIdealState({
	icon: Icon,
	title,
	description,
	iconClassName = 'h-12 w-12',
	titleClassName = 'text-lg',
	descriptionClassName = 'text-sm text-gray-600 dark:text-gray-400 mt-2',
	className = '',
}: NonIdealStateProps): JSX.Element {
	return (
		<div className={`flex flex-col items-center justify-center py-4 text-center ${className}`}>
			<div className="mb-3 opacity-60">
				<Icon className={iconClassName} strokeWidth={1.5} />
			</div>
			<div className="font-medium">
				<p className={titleClassName}>{title}</p>
				{description && <p className={descriptionClassName}>{description}</p>}
			</div>
		</div>
	)
}
