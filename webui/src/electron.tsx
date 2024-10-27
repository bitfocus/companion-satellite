import 'bootstrap/dist/css/bootstrap.min.css'
import './App.scss'

import React from 'react'
import ReactDOM from 'react-dom/client'
import { ElectronApp } from './ElectronApp.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<ElectronApp />
	</React.StrictMode>,
)
