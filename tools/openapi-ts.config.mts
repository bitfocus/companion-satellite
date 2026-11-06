import { defineConfig, type UserConfig } from '@hey-api/openapi-ts'

/** Remote specs are committed in `satellite/openapi/`; refresh them with `yarn openapi:update-specs` */
export const specs = [
	{ name: 'CompanionUpdates', url: 'https://updates.companion.free/docs/json', file: 'CompanionUpdates.json' },
] as const

export const specsDir = './satellite/openapi'

const inputs: Array<{ name: string; input: string }> = [
	// The api served by satellite itself
	{ name: 'SatelliteApi', input: './openapi.yaml' },
	...specs.map((spec) => ({ name: spec.name, input: `${specsDir}/${spec.file}` })),
]

export default defineConfig(
	inputs.map((spec): UserConfig => ({
		input: spec.input,
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
