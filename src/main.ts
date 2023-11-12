import exitHook = require('exit-hook')
import meow from 'meow'
import { CompanionSatelliteClient } from './client'
import { DeviceManager } from './devices'
import { DEFAULT_PORT, DEFAULT_REST_PORT } from './lib'
import Conf from 'conf'
import path from 'path'

import { RestServer } from './rest'
import * as fs from 'fs/promises'

const cli = meow(
	`
	Usage
	  $ companion-satellite <configuration-path>

	Examples
	  $ companion-satellite config.json
	  $ companion-satellite /home/satellite/.config/companion-satellite.json
`,
	{}
)

if (cli.input.length === 0) {
	cli.showHelp(0)
}

const rawConfigPath = cli.input[0]
const absoluteConfigPath = path.isAbsolute(rawConfigPath) ? rawConfigPath : path.join(process.cwd(), rawConfigPath)

interface AppConfig {
	companion: {
		address: string
		port: number
	}
	http: {
		enabled: boolean
		port: number
	}
}

const appConfig = new Conf<AppConfig>({
	schema: {
		companion: {
			type: 'object',
			description: 'Companion connection configuration',
			properties: {
				address: {
					type: 'string',
					description: 'Address of Companion installation',
				},
				port: {
					type: 'integer',
					description: 'Port number of Companion installation',
					minimum: 1,
					maximum: 65535,
				},
			},
			required: ['address', 'port'],
			default: {
				address: '127.0.0.1',
				port: 16622,
			},
		},
		http: {
			type: 'object',
			description: 'Satellite HTTP configuration',
			properties: {
				enabled: {
					type: 'boolean',
					description: 'Enable HTTP api',
					default: true,
				},
				port: {
					type: 'integer',
					description: 'Port number of run HTTP server on',
					minimum: 1,
					maximum: 65535,
					default: 9999,
				},
			},
			required: ['enabled', 'port'],
			default: {
				enabled: true,
				port: 9999,
			},
		},
	},
	configName: path.parse(absoluteConfigPath).name,
	projectName: 'companion-satellite',
	cwd: path.dirname(absoluteConfigPath),
})

console.log('Starting')

const client = new CompanionSatelliteClient({ debug: true })
const devices = new DeviceManager(client)
const server = new RestServer(client, devices)

client.on('log', (l) => console.log(l))
client.on('error', (e) => console.error(e))

const configFilePath = process.env.SATELLITE_CONFIG_PATH
if (configFilePath) {
	// Update the config file on changes, if a path is provided
	client.on('ipChange', (newIP, newPort) => {
		updateEnvironmentFile(configFilePath, { COMPANION_IP: newIP, COMPANION_PORT: String(newPort) }).catch((e) => {
			console.log(`Failed to update config file:`, e)
		})
	})
}

exitHook(() => {
	console.log('Exiting')
	client.disconnect()
	devices.close().catch(() => null)
	server.close()
})

client
	.connect(appConfig.get('companion.address') || '127.0.0.1', appConfig.get('companion.port') || DEFAULT_PORT)
	.catch((e) => {
		console.log(`Failed to connect`, e)
	})
server.open(appConfig.get('http.port') || DEFAULT_REST_PORT)

async function updateEnvironmentFile(filePath: string, changes: Record<string, string>): Promise<void> {
	const data = await fs.readFile(filePath, 'utf-8')

	const lines = data.split(/\r?\n/)
	for (let i = 0; i < lines.length; i++) {
		for (const key in changes) {
			if (lines[i].startsWith(key)) {
				lines[i] = key + '=' + changes[key]
			}
		}
	}

	const newData = lines.join('\n')
	await fs.writeFile(filePath, newData, 'utf-8')
}
