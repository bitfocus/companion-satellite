import * as Koa from 'koa'
import * as Router from 'koa-router'
import koaBody from 'koa-body'
import http = require('http')
import type { CompanionSatelliteClient } from './client'
import type { DeviceManager } from './devices'

export class RestServer {
	private readonly client: CompanionSatelliteClient
	private readonly devices: DeviceManager
	private readonly app: Koa
	private readonly router: Router
	private server: http.Server | undefined

	constructor(client: CompanionSatelliteClient, devices: DeviceManager) {
		this.client = client
		this.devices = devices

		this.app = new Koa()
		this.router = new Router()

		//GET
		this.router.get('/api/host', async (ctx) => {
			ctx.body = this.client.host
		})
		this.router.get('/api/port', (ctx) => {
			ctx.body = this.client.port
		})
		this.router.get('/api/config', (ctx) => {
			ctx.body = { host: this.client.host, port: this.client.port }
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
				this.client.connect(host, this.client.port).catch((e) => {
					console.log('set host failed:', e)
				})
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
				this.client.connect(this.client.host, newPort).catch((e) => {
					console.log('set port failed:', e)
				})
				ctx.body = 'OK'
			} else {
				ctx.status = 400
				ctx.body = 'Invalid port'
			}
		})
		this.router.post('/api/config', koaBody(), async (ctx) => {
			if (ctx.request.type == 'application/json') {
				const host = ctx.request.body['host']
				const port = Number(ctx.request.body['port'])

				if (!host) {
					ctx.status = 400
					ctx.body = 'Invalid host'
				} else if (isNaN(port) || port <= 0 || port > 65535) {
					ctx.status = 400
					ctx.body = 'Invalid port'
				} else {
					this.client.connect(host, port).catch((e) => {
						console.log('update config failed:', e)
					})
				}
				ctx.body = 'OK'
			}
		})

		this.router.post('/api/rescan', async (ctx) => {
			this.devices.scanDevices()

			ctx.body = 'OK'
		})

		this.app.use(this.router.routes()).use(this.router.allowedMethods())
	}

	public open(port: number): void {
		this.close()

		if (port != 0) {
			this.server = this.app.listen(port)
			console.log(`REST server starting: port: ${port}`)
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
