import { defineConfig } from 'vitest/config'

// Root workspace test runner. Each workspace defines its own project config (environment,
// includes, etc.) so e.g. `webui` can be added here later with a different environment.
export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: 'satellite',
					root: 'satellite',
					// setupFiles: ['./test/setup.ts'],
					environment: 'node',
					include: ['src/**/*.test.ts'],
					exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**'],
				},
			},
		],
	},
})
