import 'bootstrap/dist/css/bootstrap.min.css'
import './App.scss'

import React from 'react'
import ReactDOM from 'react-dom/client'
import { WebApp } from './WebApp.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<WebApp />
	</React.StrictMode>
)
