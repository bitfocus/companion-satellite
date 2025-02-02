import React from 'react'
import ReactDOM from 'react-dom/client'
import { SatelliteApiProvider } from './Api/Context.tsx'
import { AppContent } from './app/Content.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<SatelliteApiProvider api={electronApi}>
			<AppContent />
		</SatelliteApiProvider>
	</React.StrictMode>,
)
