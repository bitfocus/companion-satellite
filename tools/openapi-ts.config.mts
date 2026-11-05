import { defineConfig, type UserConfig } from '@hey-api/openapi-ts'

/** The specs are committed in `satellite/openapi/`; refresh them with `yarn openapi:update-specs` */
export const specs = [
	{ name: 'CompanionUpdates', url: 'https://updates.companion.free/docs/json', file: 'CompanionUpdates.json' },
] as const

export const specsDir = './satellite/openapi'

export default defineConfig(
	specs.map((spec): UserConfig => ({
		input: `${specsDir}/${spec.file}`,
		// satellite uses NodeNext module resolution, which needs explicit extensions
		output: { path: `./satellite/src/generated/${spec.name}`, module: { extension: '.js' } },
		plugins: [
			'@hey-api/client-fetch',
			'@hey-api/typescript',
			// Each API is on its own server, so require each call to be given its client rather than using a default one
			{ name: '@hey-api/sdk', client: false },
		],
	})),
)
