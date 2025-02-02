export const DEFAULT_TCP_PORT = 16622
export const DEFAULT_WS_PORT = 16623

export function assertNever(_v: never): void {
	// Nothing to do
}

export function wrapAsync<TArgs extends any[]>(
	fn: (...args: TArgs) => Promise<void>,
	catcher: (e: any) => void,
): (...args: TArgs) => void {
	return (...args) => {
		fn(...args).catch(catcher)
	}
}
