import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/App.tsx'
import { SatelliteApiProvider } from './Api/Context.tsx'
import { SatelliteRestApi } from './Api/rest.ts'

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<SatelliteApiProvider api={SatelliteRestApi}>
			<App />
		</SatelliteApiProvider>
	</React.StrictMode>,
)
