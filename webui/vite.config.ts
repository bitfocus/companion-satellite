import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
	base: '', // Fix electron file paths

	plugins: [react()],
	server: {
		proxy: {
			'/api': 'http://localhost:9999',
		},
	},
	build: {
		rollupOptions: {
			input: {
				main: resolve(__dirname, 'index.html'),
				electron: resolve(__dirname, 'electron.html'),
			},
		},
	},
})
