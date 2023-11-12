import Conf, { Schema } from 'conf'

export interface SatelliteConfig {
	remoteIp: string
	remotePort: number

	restEnabled: boolean
	restPort: number
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
}

export function ensureFieldsPopulated(store: Conf<SatelliteConfig>): void {
	for (const [key, schema] of Object.entries<any>(satelliteConfigSchema)) {
		if (store.get(key) === undefined && schema.default !== undefined) {
			// Ensure values are written to disk
			store.set(key, schema.default)
		}
	}
}
