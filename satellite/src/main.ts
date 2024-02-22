import exitHook = require('exit-hook')
import { CompanionSatelliteClient } from './client'
import { DeviceManager } from './devices'
import { DEFAULT_PORT } from './lib'
import { RestServer } from './rest'
import { openHeadlessConfig } from './config'
import path = require('path')

const rawConfigPath = process.argv[2]
if (!rawConfigPath) {
	console.log(`
	Usage
	  $ companion-satellite <configuration-path>

	Examples
	  $ companion-satellite config.json
	  $ companion-satellite /home/satellite/.config/companion-satellite.json
`)
	// eslint-disable-next-line no-process-exit
	process.exit(1)
}

const appConfig = openHeadlessConfig(rawConfigPath)

console.log('Starting', appConfig.path)

const webRoot = path.join(__dirname, '../../webui/dist')

const client = new CompanionSatelliteClient({ debug: true })
const devices = new DeviceManager(client)
const server = new RestServer(webRoot, appConfig, client, devices)

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
