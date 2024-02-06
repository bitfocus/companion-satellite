import exitHook = require('exit-hook')
import meow from 'meow'
import { CompanionSatelliteClient } from './client'
import { DeviceManager } from './devices'
import { DEFAULT_PORT } from './lib'
import { RestServer } from './rest'
import { openHeadlessConfig } from './config'

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
const appConfig = openHeadlessConfig(rawConfigPath)

console.log('Starting', appConfig.path)

const client = new CompanionSatelliteClient({ debug: true })
const devices = new DeviceManager(client)
const server = new RestServer(appConfig, client, devices)

client.on('log', (l) => console.log(l))
client.on('error', (e) => console.error(e))

exitHook(() => {
	console.log('Exiting')
	client.disconnect()
	devices.close().catch(() => null)
	server.close()
})

const tryConnect = () => {
	client.connect(appConfig.get('remoteIp') || '127.0.0.1', appConfig.get('remotePort') || DEFAULT_PORT).catch((e) => {
		console.log(`Failed to connect`, e)
	})
}

appConfig.onDidChange('remoteIp', () => tryConnect())
appConfig.onDidChange('remotePort', () => tryConnect())

tryConnect()
server.open()
