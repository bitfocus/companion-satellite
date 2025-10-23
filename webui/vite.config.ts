import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
	base: '', // Fix electron file paths

	define: {
		__APP_VERSION__: JSON.stringify(process.env.BUILD_VERSION || process.env.npm_package_version),
	},

	plugins: [react(), tailwindcss()],
	server: {
		proxy: {
			'/api': 'http://127.0.0.1:9999',
		},
	},
	build: {
		rollupOptions: {
			input: {
				main: resolve(__dirname, 'index.html'),
				electron: resolve(__dirname, 'electron.html'),
				about: resolve(__dirname, 'about.html'),
				// preload: resolve(__dirname, 'preload.ts'),
			},
		},
	},
	resolve: {
		alias: {
			'@': resolve(__dirname, './src'),
		},
	},
})
