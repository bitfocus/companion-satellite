/* eslint-disable n/no-process-exit */
import '@julusian/segfault-raub'
import { createLogger, logger, flushLogger } from './logging.js'

import { asyncExitHook } from 'exit-hook'
import { CompanionSatelliteClient } from './client.js'
import { SurfaceManager } from './surface-manager.js'
import { RestServer } from './rest.js'
import { getConnectionDetailsFromConfig, listenToConnectionConfigChanges, openHeadlessConfig } from './config.js'
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

logger.info(`Starting with config: ${appConfig.path}`)

const webRoot = fileURLToPath(new URL('../../webui/dist', import.meta.url))

const client = new CompanionSatelliteClient({ debug: true })
const surfaceManager = await SurfaceManager.create(client, appConfig.get('surfacePluginsEnabled'))
const server = new RestServer(webRoot, appConfig, client, surfaceManager)
const mdnsAnnouncer = new MdnsAnnouncer(appConfig)

const clientLogger = createLogger('SatelliteClient')
client.on('log', (l) => clientLogger.info(l))
client.on('error', (e) => clientLogger.error(e))

asyncExitHook(
	async () => {
		logger.info('Exiting')
		await Promise.allSettled([
			(async () => client.disconnect())(),
			surfaceManager.close(),
			(async () => server.close())(),
		])
		await flushLogger()
		process.exit(0)
	},
	{
		wait: 2000,
	},
)

const tryConnect = () => {
	client.connect(getConnectionDetailsFromConfig(appConfig)).catch((e) => {
		clientLogger.error(`Failed to connect: ${e}`)
	})
}

listenToConnectionConfigChanges(appConfig, tryConnect)
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
