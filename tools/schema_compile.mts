import * as fs from 'fs'
import { compileFromFile } from 'json-schema-to-typescript'
import { fileURLToPath } from 'url'

// Once we drop node18, we can use an import statement instead of a fs readFileSync
// import schema from '../assets/manifest.schema.json' with { type: 'json' }
const PrettierConf = JSON.parse(fs.readFileSync(new URL('../.prettierrc.json', import.meta.url), 'utf8'))

const surfaceSchemaPath = fileURLToPath(
	new URL('../../companion/assets/satellite-surface.schema.json', import.meta.url),
)
const compiledSurfaceSchema = await compileFromFile(surfaceSchemaPath, {
	additionalProperties: false,
	style: PrettierConf,
	enableConstEnums: false,
})
fs.writeFileSync(
	new URL('../satellite/src/generated/SurfaceManifestSchema.ts', import.meta.url),
	compiledSurfaceSchema,
	'utf8',
)

const configFieldsSchemaPath = fileURLToPath(
	new URL('../../companion/assets/satellite-config-fields.schema.json', import.meta.url),
)
const compiledConfigFieldsSchema = await compileFromFile(configFieldsSchemaPath, {
	additionalProperties: false,
	style: PrettierConf,
	enableConstEnums: false,
})
fs.writeFileSync(
	new URL('../satellite/src/generated/SatelliteConfigFieldsSchema.ts', import.meta.url),
	compiledConfigFieldsSchema,
	'utf8',
)
