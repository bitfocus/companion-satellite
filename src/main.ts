import exitHook = require('exit-hook')
import meow from 'meow'
import { CompanionSatelliteClient } from './client'
import { DeviceManager } from './devices'
import { DEFAULT_PORT, DEFAULT_REST_PORT } from './lib'
import Conf from 'conf'
import path from 'path'
import { RestServer } from './rest'
import { SatelliteConfig, ensureFieldsPopulated, satelliteConfigSchema } from './config'

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

const appConfig = new Conf<SatelliteConfig>({
	schema: satelliteConfigSchema,
	configName: path.parse(absoluteConfigPath).name,
	projectName: 'companion-satellite',
	cwd: path.dirname(absoluteConfigPath),
})
ensureFieldsPopulated(appConfig)

console.log('Starting', appConfig.path)

const client = new CompanionSatelliteClient({ debug: true })
const devices = new DeviceManager(client)
const server = new RestServer(client, devices)

client.on('log', (l) => console.log(l))
client.on('error', (e) => console.error(e))

exitHook(() => {
	console.log('Exiting')
	client.disconnect()
	devices.close().catch(() => null)
	server.close()
})

client.connect(appConfig.get('remoteIp') || '127.0.0.1', appConfig.get('remotePort') || DEFAULT_PORT).catch((e) => {
	console.log(`Failed to connect`, e)
})
server.open(appConfig.get('restEnabled') ? appConfig.get('restPort') || DEFAULT_REST_PORT : 0)
