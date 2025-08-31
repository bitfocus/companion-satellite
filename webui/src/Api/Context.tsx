import React, { createContext, JSX, useContext } from 'react'
import type { SatelliteUiApi } from './types'

const ApiContext = createContext<SatelliteUiApi | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useSatelliteApi(): SatelliteUiApi {
	const api = useContext(ApiContext)
	if (!api) throw new Error('useApi must be used within an ApiProvider')

	return api
}

export function SatelliteApiProvider({
	children,
	api,
}: {
	children: React.ReactNode
	api: SatelliteUiApi
}): JSX.Element {
	return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
}
