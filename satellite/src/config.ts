import Conf, { Schema } from 'conf'
import path from 'path'
import os from 'os'
import { customAlphabet } from 'nanoid'
import { SomeConnectionDetails } from './clientImplementations.js'
import { assertNever, DEFAULT_TCP_PORT, DEFAULT_WS_PORT } from './lib.js'
import debounceFn from 'debounce-fn'
import { setMaxListeners } from 'events'

const nanoidHex = customAlphabet('0123456789abcdef')

export type SatelliteConfigInstance = Conf<SatelliteConfig>

export interface SatelliteConfig {
	remoteProtocol: 'tcp' | 'ws'
	remoteIp: string
	remotePort: number
	remoteWsAddress: string

	installationName: string

	restEnabled: boolean
	restPort: number

	mdnsEnabled: boolean

	surfacePluginsEnabled: Record<string, boolean>
}

export const satelliteConfigSchema: Schema<SatelliteConfig> = {
	remoteProtocol: {
		type: 'string',
		enum: ['tcp', 'ws'],
		description: 'Protocol to use for connecting to Companion installation',
		default: 'tcp',
	},
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
		default: DEFAULT_TCP_PORT,
	},
	remoteWsAddress: {
		type: 'string',
		description: 'Websocket address of Companion installation',
		default: `ws://127.0.0.1:${DEFAULT_WS_PORT}`,
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
	setMaxListeners(0, appConfig.events)

	ensureFieldsPopulated(appConfig)
	return appConfig
}

export function getConnectionDetailsFromConfig(config: SatelliteConfigInstance): SomeConnectionDetails {
	const protocol = config.get('remoteProtocol')
	switch (protocol) {
		case 'tcp':
			return {
				mode: 'tcp',
				host: config.get('remoteIp') || '127.0.0.1',
				port: config.get('remotePort') || DEFAULT_TCP_PORT,
			}
		case 'ws':
			return {
				mode: 'ws',
				url: config.get('remoteWsAddress') || `ws://127.0.0.1:${DEFAULT_WS_PORT}`,
			}
		default:
			assertNever(protocol)
			return {
				mode: 'tcp',
				host: config.get('remoteIp'),
				port: config.get('remotePort'),
			}
	}
}

export function listenToConnectionConfigChanges(config: SatelliteConfigInstance, tryConnect: () => void): void {
	const debounceConnect = debounceFn(tryConnect, { wait: 50, after: true, before: false })

	config.onDidChange('remoteProtocol', debounceConnect)
	config.onDidChange('remoteIp', debounceConnect)
	config.onDidChange('remotePort', debounceConnect)
	config.onDidChange('remoteWsAddress', debounceConnect)
}
