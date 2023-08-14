import * as Koa from 'koa'
import Router from 'koa-router'
import koaBody from 'koa-body'
import http = require('http')
import { CompanionSatelliteClient } from './client'

export class RestServer {
    private _cs_client: CompanionSatelliteClient
    private _server: http.Server
    private server: http.Server
    private app: Koa
    private router: Router

    constructor(client: CompanionSatelliteClient) {

        this.app = new Koa()
        this.router = new Router()
        this._cs_client = client
        // super()

        //GET
        this.router.get('/api/host', (ctx, next) => {
            ctx.body = { host: this._cs_client.host }
        })
        this.router.get('/api/port', (ctx, next) => {
            ctx.body = { port: this._cs_client.port }
        })
        this.router.get('/api/config', (ctx, next) => {
            ctx.body = { host: this._cs_client.host, port: this._cs_client.port }
        })

        //POST
        this.router.post('/api/host', koaBody(), (ctx, next) => {
            this._cs_client.connect(ctx.request.body.data['host'], this._cs_client.port)
        })
        this.router.post('/api/port', koaBody(), (ctx, next) => {
            this._cs_client.connect(this._cs_client.host, ctx.request.body.data['port'])
        })
        this.router.post('/api/config', (ctx, next) => {
            this._cs_client.connect(ctx.request.body.data['host'], ctx.request.body.data['port'])

        })

        this.app
            .use(this.router.routes())
            .use(this.router.allowedMethods())

    }

    public open(port: Number) {
        if (this._server.listening) { this.close() }
        if (port != 0) {
            this.server = this.app.listen(port)
            console.log(`REST server starting: port: ${port}`)
        } else {
            console.log("REST server not starting: port 0")
        }

    }

    public close(): void {
        this.server.close()
        this.server.closeAllConnections()
        console.log("The rest server is closed")
    }

}