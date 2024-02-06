import { useEffect, useReducer, useRef, useState } from 'react'
import { useInterval } from 'usehooks-ts'

interface State<T> {
	data?: T
	error?: Error
	lastPoll?: number
}

// discriminated union type
type Action<T> = { type: 'loading' } | { type: 'fetched'; payload: T } | { type: 'error'; payload: Error }

export function useFetchInterval<T = unknown>(interval: number, url: string, options?: RequestInit): State<T> {
	// Invalidate the request on an interval
	const [refreshToken, setRefreshToken] = useState(Date.now())
	useInterval(() => setRefreshToken(Date.now()), interval)

	// Used to prevent state update if the component is unmounted
	const cancelRequest = useRef<boolean>(false)

	const initialState: State<T> = {
		error: undefined,
		data: undefined,
		lastPoll: undefined,
	}

	// Keep state logic separated
	const fetchReducer = (state: State<T>, action: Action<T>): State<T> => {
		switch (action.type) {
			case 'loading':
				return { ...initialState }
			case 'fetched':
				return { ...initialState, data: action.payload, lastPoll: Date.now() }
			case 'error':
				return { ...initialState, error: action.payload, lastPoll: Date.now() }
			default:
				return state
		}
	}

	const [state, dispatch] = useReducer(fetchReducer, initialState)

	useEffect(() => {
		// Do nothing if the url is not given
		if (!url) return

		cancelRequest.current = false

		const fetchData = async () => {
			// dispatch({ type: 'loading' })

			try {
				const response = await fetch(url, options)
				if (!response.ok) {
					throw new Error(response.statusText)
				}

				const data = (await response.json()) as T
				if (cancelRequest.current) return

				dispatch({ type: 'fetched', payload: data })
			} catch (error) {
				if (cancelRequest.current) return

				dispatch({ type: 'error', payload: error as Error })
			}
		}

		void fetchData()

		// Use the cleanup function for avoiding a possibly...
		// ...state update after the component was unmounted
		return () => {
			cancelRequest.current = true
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [url, refreshToken])

	return state
}
