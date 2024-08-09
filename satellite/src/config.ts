import Conf, { Schema } from 'conf'
import path from 'path'

export interface SatelliteConfig {
	remoteIp: string
	remotePort: number

	installationName: string

	restEnabled: boolean
	restPort: number

	mdnsEnabled: boolean
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
		default: 'TODO - something here',
	},

	restEnabled: {
		type: 'boolean',
		description: 'Enable HTTP api',
		default: true,
	},
	restPort: {
		type: 'integer',
		description: 'Port number of run HTTP server on',
		minimum: 1,
		maximum: 65535,
		default: 9999,
	},
	mdnsEnabled: {
		type: 'boolean',
		description: 'Enable mDNS announcement',
		default: true,
	},
}

export function ensureFieldsPopulated(store: Conf<SatelliteConfig>): void {
	for (const [key, schema] of Object.entries<any>(satelliteConfigSchema)) {
		if (store.get(key) === undefined && schema.default !== undefined) {
			// Ensure values are written to disk
			store.set(key, schema.default)
		}
	}
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
