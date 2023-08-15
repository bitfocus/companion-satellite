import * as Koa from 'koa'
import * as Router from 'koa-router'
import koaBody from 'koa-body'
import http = require('http')
import { CompanionSatelliteClient } from './client'

export class RestServer {
    private _cs_client: CompanionSatelliteClient
    private server: http.Server | undefined
    private app: Koa
    private router: Router

    constructor(client: CompanionSatelliteClient) {

        this._cs_client = client
        this.app = new Koa()
        this.router = new Router()

        //GET
        this.router.get('/api/host', (ctx: any) => {
            ctx.body = this._cs_client.host
        })
        this.router.get('/api/port', (ctx: any) => {
            ctx.body = this._cs_client.port
        })
        this.router.get('/api/config', (ctx: any) => {
            ctx.body = { host: this._cs_client.host, port: this._cs_client.port }
        })

        //POST
        this.router.post('/api/host', koaBody(), (ctx: any) => {
			let host = ''
            if (ctx.request.type == 'application/json') {
                host = ctx.request.body['host']
            } else if (ctx.request.type == 'text/plain') {
                host = ctx.request.body
            }

			if (host) {
				this._cs_client.connect(host, this._cs_client.port).catch(e => {
					console.log('set host failed:', e)
				})
				ctx.body = 'OK'
			} else {
				ctx.status = 400
				ctx.body = 'Invalid host'
			}
        })
        this.router.post('/api/port', koaBody(), (ctx: any) => {
			let newPort = NaN
            if (ctx.request.type == 'application/json') {
                newPort = Number(ctx.request.body['port'])
            } else if (ctx.request.type == 'text/plain') {
                newPort = Number( ctx.request.body)
            }

			if (!isNaN(newPort) && newPort > 0 && newPort <= 65535) {
				this._cs_client.connect(this._cs_client.host, newPort).catch(e => {
					console.log('set port failed:', e)
				})
				ctx.body = 'OK'
			} else {
				ctx.status = 400
				ctx.body = 'Invalid port'
			}
        })
        this.router.post('/api/config', koaBody(), (ctx: any) => {
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
					this._cs_client.connect(host, port).catch(e => {
						console.log('update config failed:', e)
					})
				}
				ctx.body = 'OK'
			}
        })

        this.app
            .use(this.router.routes())
            .use(this.router.allowedMethods())

    }

    public open(port: Number) {
        this.close()

        if (port != 0) {
            this.server = this.app.listen(port)
            console.log(`REST server starting: port: ${port}`)
        } else {
            console.log("REST server not starting: port 0")
        }

    }

    public close(): void {
        if(this.server && this.server.listening) {
            this.server.close()
            this.server.closeAllConnections()
			delete this.server
            console.log("The rest server is closed")
        }
    }

}