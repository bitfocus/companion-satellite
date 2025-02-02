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
	compileConfig,
	compileStatus,
	updateConfig,
} from './apiTypes.js'

export class RestServer {
	private readonly appConfig: Conf<SatelliteConfig>
	private readonly client: CompanionSatelliteClient
	private readonly surfaceManager: SurfaceManager
	private readonly app: Koa
	private readonly router: Router
	private server: http.Server | undefined

	constructor(
		webRoot: string,
		appConfig: Conf<SatelliteConfig>,
		client: CompanionSatelliteClient,
		surfaceManager: SurfaceManager,
	) {
		this.appConfig = appConfig
		this.client = client
		this.surfaceManager = surfaceManager

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

		this.router.post('/api/rescan', async (ctx) => {
			this.surfaceManager.scanForSurfaces()

			ctx.body = 'OK'
		})

		this.router.get('/api/surfaces', async (ctx) => {
			ctx.body = this.surfaceManager.getKnownSurfaces() satisfies ApiSurfaceInfo[]
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
				console.log(`REST server starting: port: ${port}`)
			} catch (error) {
				console.error('Error starting REST server:', error)
			}
		} else {
			console.log('REST server not starting: port 0')
		}
	}

	public close(): void {
		if (this.server && this.server.listening) {
			this.server.close()
			this.server.closeAllConnections()
			delete this.server
			console.log('The rest server is closed')
		}
	}
}
