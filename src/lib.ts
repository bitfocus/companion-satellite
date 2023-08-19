export const DEFAULT_PORT = 16622
export const DEFAULT_REST_PORT = 9999 // Note: this is also defined elsewhere

export function assertNever(_v: never): void {
	// Nothing to do
}

export function wrapAsync<TArgs extends any[]>(
	fn: (...args: TArgs) => Promise<void>,
	catcher: (e: any) => void
): (...args: TArgs) => void {
	return (...args) => {
		fn(...args).catch(catcher)
	}
}
