import Koa from 'koa'
import Router from 'koa-router'
import { koaBody } from 'koa-body'
import serve from 'koa-static'
import http from 'http'
import type Conf from 'conf'
import type { CompanionSatelliteClient } from './client.js'
import type { SurfaceManager } from './surface-manager.js'
import type { SatelliteConfig } from './config.js'
import {
	ApiConfigData,
	ApiConfigDataUpdate,
	ApiConfigDataUpdateElectron,
	ApiSurfaceInfo,
	ApiSurfacePluginInfo,
	ApiSurfacePluginsEnabled,
	compileConfig,
	compileStatus,
	updateConfig,
	updateSurfacePluginsEnabledConfig,
} from './apiTypes.js'
import { createLogger } from './logging.js'
import type { ModuleManager } from './module-store/index.js'

export class RestServer {
	readonly #logger = createLogger('RestServer')

	private readonly appConfig: Conf<SatelliteConfig>
	private readonly client: CompanionSatelliteClient
	private readonly surfaceManager: SurfaceManager
	private readonly moduleManager: ModuleManager | null
	private readonly app: Koa
	private readonly router: Router
	private server: http.Server | undefined

	constructor(
		webRoot: string,
		appConfig: Conf<SatelliteConfig>,
		client: CompanionSatelliteClient,
		surfaceManager: SurfaceManager,
		moduleManager: ModuleManager | null = null,
	) {
		this.appConfig = appConfig
		this.client = client
		this.surfaceManager = surfaceManager
		this.moduleManager = moduleManager

		// Monitor for config changes
		this.appConfig.onDidChange('restEnabled', this.open.bind(this))
		this.appConfig.onDidChange('restPort', this.open.bind(this))

		this.app = new Koa()
		this.app.use(serve(webRoot))

		this.router = new Router()

		//GET
		this.router.get('/api/host', async (ctx) => {
			ctx.body = this.appConfig.get('remoteIp')
		})
		this.router.get('/api/port', (ctx) => {
			ctx.body = this.appConfig.get('remotePort')
		})
		this.router.get('/api/connected', (ctx) => {
			ctx.body = this.client.connected
		})
		this.router.get('/api/config', (ctx) => {
			ctx.body = compileConfig(this.appConfig)
		})
		this.router.get('/api/status', (ctx) => {
			ctx.body = compileStatus(this.client)
		})

		//POST
		this.router.post('/api/host', koaBody(), async (ctx) => {
			let host = ''
			if (ctx.request.type == 'application/json') {
				host = ctx.request.body['host']
			} else if (ctx.request.type == 'text/plain') {
				host = ctx.request.body
			}

			if (host) {
				this.appConfig.set('remoteIp', host)

				ctx.body = 'OK'
			} else {
				ctx.status = 400
				ctx.body = 'Invalid host'
			}
		})
		this.router.post('/api/port', koaBody(), async (ctx) => {
			let newPort = NaN
			if (ctx.request.type == 'application/json') {
				newPort = Number(ctx.request.body['port'])
			} else if (ctx.request.type == 'text/plain') {
				newPort = Number(ctx.request.body)
			}

			if (!isNaN(newPort) && newPort > 0 && newPort <= 65535) {
				this.appConfig.set('remotePOrt', newPort)

				ctx.body = 'OK'
			} else {
				ctx.status = 400
				ctx.body = 'Invalid port'
			}
		})
		this.router.post('/api/config', koaBody(), async (ctx) => {
			if (ctx.request.type == 'application/json') {
				const body = ctx.request.body as Partial<ApiConfigData>

				const partialConfig: ApiConfigDataUpdate = {}

				const protocol = body.protocol
				if (protocol !== undefined) {
					if (typeof protocol === 'string') {
						partialConfig.protocol = protocol
					} else {
						ctx.status = 400
						ctx.body = 'Invalid protocol'
					}
				}

				const host = body.host
				if (host !== undefined) {
					if (typeof host === 'string') {
						partialConfig.host = host
					} else {
						ctx.status = 400
						ctx.body = 'Invalid host'
					}
				}

				const port = Number(body.port)
				if (isNaN(port) || port <= 0 || port > 65535) {
					ctx.status = 400
					ctx.body = 'Invalid port'
				} else {
					partialConfig.port = port
				}

				const wsAddress = body.wsAddress
				if (wsAddress !== undefined) {
					if (typeof wsAddress === 'string') {
						partialConfig.wsAddress = wsAddress
					} else {
						ctx.status = 400
						ctx.body = 'Invalid wsAddress'
					}
				}

				const installationName = body.installationName
				if (installationName !== undefined) {
					if (typeof installationName === 'string') {
						partialConfig.installationName = installationName
					} else {
						ctx.status = 400
						ctx.body = 'Invalid installationName'
					}
				}

				const mdnsEnabled = body.mdnsEnabled
				if (mdnsEnabled !== undefined) {
					if (typeof mdnsEnabled === 'boolean') {
						partialConfig.mdnsEnabled = mdnsEnabled
					} else {
						ctx.status = 400
						ctx.body = 'Invalid mdnsEnabled'
					}
				}

				// Ensure some fields cannot be changed
				const tmpPartialConfig: ApiConfigDataUpdateElectron = partialConfig
				delete tmpPartialConfig.httpEnabled
				delete tmpPartialConfig.httpPort

				updateConfig(this.appConfig, partialConfig)
				ctx.body = compileConfig(this.appConfig)
			}
		})

		this.router.post('/api/surfaces/rescan', async (ctx) => {
			this.surfaceManager.scanForSurfaces()

			ctx.body = 'OK'
		})

		this.router.get('/api/surfaces', async (ctx) => {
			ctx.body = this.surfaceManager.getOpenSurfacesInfo() satisfies ApiSurfaceInfo[]
		})

		this.router.get('/api/surfaces/plugins/installed', async (ctx) => {
			ctx.body = this.surfaceManager.getAvailablePluginsInfo() satisfies ApiSurfacePluginInfo[]
		})

		this.router.get('/api/surfaces/plugins/enabled', async (ctx) => {
			ctx.body = this.appConfig.get('surfacePluginsEnabled') satisfies ApiSurfacePluginsEnabled
		})
		this.router.post('/api/surfaces/plugins/enabled', koaBody(), async (ctx) => {
			if (ctx.request.type != 'application/json') {
				ctx.status = 400
				ctx.body = 'Invalid request'
				return
			}

			if (typeof ctx.request.body !== 'object') {
				ctx.status = 400
				ctx.body = 'Invalid request'
				return
			}

			const newConfig = ctx.request.body as ApiSurfacePluginsEnabled
			updateSurfacePluginsEnabledConfig(this.appConfig, newConfig)

			ctx.body = this.appConfig.get('surfacePluginsEnabled')
		})

		// Module management endpoints (only available if moduleManager is provided)
		this.router.get('/api/modules/available', async (ctx) => {
			if (!this.moduleManager) {
				ctx.status = 501
				ctx.body = { error: 'Module management not available' }
				return
			}

			const modules = this.moduleManager.getAvailableModules()
			ctx.body = {
				modules: modules ? Object.values(modules) : [],
				lastUpdated: Date.now(),
			}
		})

		this.router.get('/api/modules/installed', async (ctx) => {
			if (!this.moduleManager) {
				ctx.status = 501
				ctx.body = { error: 'Module management not available' }
				return
			}

			ctx.body = {
				modules: this.moduleManager.getInstalledModules().map((m) => ({
					id: m.id,
					name: m.manifest.name,
					version: m.version,
					isBeta: m.isBeta,
				})),
			}
		})

		this.router.post('/api/modules/install', koaBody(), async (ctx) => {
			if (!this.moduleManager) {
				ctx.status = 501
				ctx.body = { error: 'Module management not available' }
				return
			}

			if (ctx.request.type !== 'application/json') {
				ctx.status = 400
				ctx.body = { error: 'Invalid content type' }
				return
			}

			const { moduleId, version } = ctx.request.body as { moduleId?: string; version?: string }
			if (!moduleId) {
				ctx.status = 400
				ctx.body = { error: 'moduleId is required' }
				return
			}

			const result = await this.moduleManager.installModule(moduleId, version ?? null)
			if (result.success) {
				// Add newly loaded plugin to SurfaceManager for immediate device detection
				const loadedPlugins = this.moduleManager.getLoadedPlugins()
				const newPlugin = loadedPlugins.find((p) => p.info.pluginId === moduleId)
				if (newPlugin) {
					await this.surfaceManager.addPlugin(newPlugin)
				}
				ctx.body = { success: true }
			} else {
				ctx.status = 400
				ctx.body = { success: false, error: result.error }
			}
		})

		this.router.delete('/api/modules/:moduleId/:version', async (ctx) => {
			if (!this.moduleManager) {
				ctx.status = 501
				ctx.body = { error: 'Module management not available' }
				return
			}

			const { moduleId, version } = ctx.params
			const result = await this.moduleManager.uninstallModule(moduleId, version)

			if (result.success) {
				ctx.body = { success: true }
			} else {
				ctx.status = 400
				ctx.body = { success: false, error: result.error }
			}
		})

		this.router.get('/api/modules/updates', async (ctx) => {
			if (!this.moduleManager) {
				ctx.status = 501
				ctx.body = { error: 'Module management not available' }
				return
			}

			const updates = await this.moduleManager.checkForUpdates()
			ctx.body = { updates }
		})

		this.router.post('/api/modules/refresh', async (ctx) => {
			if (!this.moduleManager) {
				ctx.status = 501
				ctx.body = { error: 'Module management not available' }
				return
			}

			await this.moduleManager.refreshStoreList()
			ctx.body = { success: true }
		})

		this.app.use(this.router.routes()).use(this.router.allowedMethods())
	}

	public open(): void {
		this.close()

		const enabled = this.appConfig.get('restEnabled')
		const port = this.appConfig.get('restPort')

		if (enabled && port) {
			try {
				this.server = this.app.listen(port)
				this.#logger.info(`REST server starting: port: ${port}`)
			} catch (error) {
				this.#logger.error(`Error starting REST server: ${error}`)
			}
		} else {
			this.#logger.info('REST server not starting: port 0')
		}
	}

	public close(): void {
		if (this.server && this.server.listening) {
			this.server.close()
			this.server.closeAllConnections()
			delete this.server
			this.#logger.info('The rest server is closed')
		}
	}
}
