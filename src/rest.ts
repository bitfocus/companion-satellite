import * as Koa from 'koa'
import * as Router from 'koa-router'
import koaBody from 'koa-body'
import http = require('http')
import { CompanionSatelliteClient } from './client'

export class RestServer {
    private _cs_client: CompanionSatelliteClient
    private server!: http.Server
    private app: Koa
    private router: Router

    constructor(client: CompanionSatelliteClient) {

        this.app = new Koa()
        this.router = new Router()
        this._cs_client = client
        // super()

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
            if (ctx.request.type == 'application/json') {
                this._cs_client.connect(ctx.request.body['host'], this._cs_client.port)
                ctx.body = 'OK'
            } else if (ctx.request.type == 'text/plain') {
                this._cs_client.connect(ctx.request.body, this._cs_client.port)
                ctx.body = 'OK'
            }
        })
        this.router.post('/api/port', koaBody(), (ctx: any) => {
            if (ctx.request.type == 'application/json') {
                this._cs_client.connect(this._cs_client.host, ctx.request.body['port'])
                ctx.body = 'OK'
            } else if (ctx.request.type == 'text/plain') {
                this._cs_client.connect(this._cs_client.host, ctx.request.body)
                ctx.body = 'OK'
            }
        })
        this.router.post('/api/config', koaBody(), (ctx: any) => {
            if (ctx.request.type == 'application/json') {
                this._cs_client.connect(ctx.request.body['host'], ctx.request.body['port'])
            }
            ctx.body = 'OK'
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
        if(this.server != null && this.server.listening) {
            this.server.close()
            this.server.closeAllConnections()
            console.log("The rest server is closed")
        }
    }

}