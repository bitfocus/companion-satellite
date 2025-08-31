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

/**
 * Make all optional properties be required and `| undefined`
 * This is useful to ensure that no property is missed, when manually converting between types, but allowing fields to be undefined
 */
export type Complete<T> = {
	[P in keyof Required<T>]: Pick<T, P> extends Required<Pick<T, P>> ? T[P] : T[P] | undefined
}
