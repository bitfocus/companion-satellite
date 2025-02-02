/* eslint-disable n/no-process-exit */
import '@julusian/segfault-raub'

import exitHook from 'exit-hook'
import { CompanionSatelliteClient } from './client.js'
import { SurfaceManager } from './surface-manager.js'
import { DEFAULT_PORT } from './lib.js'
import { RestServer } from './rest.js'
import { openHeadlessConfig } from './config.js'
import { fileURLToPath } from 'url'
import { MdnsAnnouncer } from './mdnsAnnouncer.js'
import debounceFn from 'debounce-fn'

const rawConfigPath = process.argv[2]
if (!rawConfigPath) {
	console.log(`
	Usage
	  $ companion-satellite <configuration-path>

	Examples
	  $ companion-satellite config.json
	  $ companion-satellite /home/satellite/.config/companion-satellite.json
`)

	process.exit(1)
}

const appConfig = openHeadlessConfig(rawConfigPath)

console.log('Starting', appConfig.path)

const webRoot = fileURLToPath(new URL('../../webui/dist', import.meta.url))

const client = new CompanionSatelliteClient({ debug: true })
const surfaceManager = await SurfaceManager.create(client, appConfig.get('surfacePluginsEnabled'))
const server = new RestServer(webRoot, appConfig, client, surfaceManager)
const mdnsAnnouncer = new MdnsAnnouncer(appConfig)

client.on('log', (l) => console.log(l))
client.on('error', (e) => console.error(e))

exitHook(() => {
	console.log('Exiting')
	client.disconnect()
	surfaceManager.close().catch(() => null)
	server.close()
})

const tryConnect = () => {
	client.connect(appConfig.get('remoteIp') || '127.0.0.1', appConfig.get('remotePort') || DEFAULT_PORT).catch((e) => {
		console.log(`Failed to connect`, e)
	})
}

appConfig.onDidChange('remoteIp', () => tryConnect())
appConfig.onDidChange('remotePort', () => tryConnect())
appConfig.onDidChange(
	'surfacePluginsEnabled',
	debounceFn(() => surfaceManager.updatePluginsEnabled(appConfig.get('surfacePluginsEnabled')), {
		wait: 50,
		after: true,
		before: false,
	}),
)

tryConnect()
server.open()
mdnsAnnouncer.start()
