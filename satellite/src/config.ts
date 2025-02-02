import Conf, { Schema } from 'conf'
import path from 'path'
import os from 'os'
import { customAlphabet } from 'nanoid'

const nanoidHex = customAlphabet('0123456789abcdef')

export type SatelliteConfigInstance = Conf<SatelliteConfig>

export interface SatelliteConfig {
	remoteIp: string
	remotePort: number

	installationName: string

	restEnabled: boolean
	restPort: number

	mdnsEnabled: boolean

	surfacePluginsEnabled: Record<string, boolean>
}

export const satelliteConfigSchema: Schema<SatelliteConfig> = {
	remoteIp: {
		type: 'string',
		description: 'Address of Companion installation',
		default: '127.0.0.1',
	},
	remotePort: {
		type: 'integer',
		description: 'Port number of Companion installation',
		minimum: 1,
		maximum: 65535,
		default: 16622,
	},

	installationName: {
		type: 'string',
		description: 'Name for this Satellite installation',
		default: `Satellite ${os.hostname()} (${nanoidHex(8)})`,
	},

	restEnabled: {
		type: 'boolean',
		description: 'Enable HTTP api',
		default: true,
	},
	restPort: {
		type: 'integer',
		description: 'Port number to run HTTP server on',
		minimum: 1,
		maximum: 65535,
		default: 9999,
	},
	mdnsEnabled: {
		type: 'boolean',
		description: 'Enable mDNS announcement',
		default: true,
	},

	surfacePluginsEnabled: {
		type: 'object',
		patternProperties: {
			'': {
				type: 'boolean',
			},
		},
		description: 'Enabled Surface Plugins',
		default: {
			'elgato-streamdeck': true,
			loupedeck: true,
			infinitton: true,
		},
	},
}

export function ensureFieldsPopulated(store: Conf<SatelliteConfig>): void {
	// Note: This doesn't appear to do anything, as Conf is populated with defaults
	for (const [key, schema] of Object.entries<any>(satelliteConfigSchema)) {
		if (store.get(key) === undefined && schema.default !== undefined) {
			// Ensure values are written to disk
			store.set(key, schema.default)
		}
	}

	// Ensure that the store with the filled in defaults is written to disk
	// eslint-disable-next-line no-self-assign
	store.store = store.store
}

export function openHeadlessConfig(rawConfigPath: string): Conf<SatelliteConfig> {
	const absoluteConfigPath = path.isAbsolute(rawConfigPath) ? rawConfigPath : path.join(process.cwd(), rawConfigPath)

	const appConfig = new Conf<SatelliteConfig>({
		schema: satelliteConfigSchema,
		configName: path.parse(absoluteConfigPath).name,
		projectName: 'companion-satellite',
		cwd: path.dirname(absoluteConfigPath),
	})
	ensureFieldsPopulated(appConfig)
	return appConfig
}
