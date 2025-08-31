import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
	base: '', // Fix electron file paths

	define: {
		__APP_VERSION__: JSON.stringify(process.env.BUILD_VERSION || process.env.npm_package_version),
	},

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
				about: resolve(__dirname, 'about.html'),
				// preload: resolve(__dirname, 'preload.ts'),
			},
		},
	},
	css: {
		preprocessorOptions: {
			scss: {
				quietDeps: true,
			},
		},
	},
	resolve: {
		alias: {
			'@': resolve(__dirname, './src'),
		},
	},
})
