import http = require('http')
import net = require('net')
import { CompanionSatelliteClient } from './client'

export class RestServer {
    private _cs_client: CompanionSatelliteClient
    private _server: http.Server

    constructor(client: CompanionSatelliteClient, port: Number) {

        this._cs_client = client
        // super()

        this._server = http.createServer(async (req, res) => {
            //set the request route
            if (req.method === 'GET') {
                console.log("api get: ", req.url)
                switch (req.url) {
                    //#TODO:add host case
                    case ('/api/ip'): {
                        res.writeHead(200, { "Content-Type": "application/json" })
                        res.write(this._cs_client.host)
                        res.end()
                        break
                    }
                    case ('/api/port'): {
                        res.writeHead(200, { "Content-Type": "application/json" })
                        res.write(String(this._cs_client.port))
                        res.end()
                        break
                    }
                    default: {
                        res.writeHead(204, { "Content-Type": "application/json" })
                        res.end(JSON.stringify({ message: "Route not found" }))
                        break
                    }
                }
            }
            if (req.method === 'POST') {
                let body = ''
                req.on('data', (data) => {
                    body += data
                })
                req.on('end', () => {
                    console.log("api post:", req.url, body)
                    switch (req.url) {
                        case ('/api/ip'): {
                            if (net.isIP(body) != 0) {
                                res.writeHead(200, { "Content-Type": "application/json" })
                                res.end()
                                this._cs_client.connect(body, this._cs_client.port)
                            } else {
                                res.writeHead(400, { "Content-Type": "application/json" })
                                res.end(JSON.stringify({ message: "Malformed ip" }))
                            }
                            break
                        }
                        case ('/api/port'): {
                            let port = Number(body)
                            if (port && port > 0 && port < 65535) {
                                res.writeHead(200, { "Content-Type": "application/json" })
                                res.end()
                                this._cs_client.connect(this._cs_client.host, port)
                            } else {
                                res.writeHead(400, { "Content-Type": "application/json" })
                                res.end(JSON.stringify({ message: "bad port" }))
                            }
                            break
                        }
                        default: {
                            res.writeHead(204, { "Content-Type": "application/json" })
                            res.end(JSON.stringify({ message: "Route not found" }))
                            break
                        }
                    }
                })
            }
        })

        this.open(port)
    }

    public open(port: Number) {
        if (port != 0) {
            this._server.listen(port, () => {
                console.log(`REST server starting: port: ${port}`)
            })
        }else {
            console.log("REST server not starting: port 0")
        }

    }

    public close(): void {
        this._server.close((err) => {
            console.log("The rest server is closed")
            if (err) console.log(err)
        })
    }

}