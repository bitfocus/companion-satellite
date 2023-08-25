import exitHook = require('exit-hook')
import * as meow from 'meow'
import { CompanionSatelliteClient } from './client'
import { DeviceManager } from './devices'

import { RestServer } from './rest'

import { Conifg } from './config'

const cli = meow(
	`
	Usage
	  $ companion-satellite 

	Options
		--target, -t			target ip or host name of the companion server
		--port, -p				port for the Satellite API
		--rest, -r				enables the rust server and set a port
`,
	{
		flags: {
			config: {
				type: 'string',
				shortflag: 'c',
			},
			target: {
				type: 'string',
				shortflag: 't',
				default: '127.0.0.1',
			},
			port: {
				type: 'number',
				shortflag: 'p',
				default: 16622,
			},
			rest: {
				type: 'number',
				shortflag: 'r',
				default: 0,
			},
		},
	}
)

console.log(cli.flags)

const config = new Conifg()

console.log('Starting')

const client = new CompanionSatelliteClient({ debug: true })
const devices = new DeviceManager(client)
const server = new RestServer(client, devices)

client.on('log', (l) => console.log(l))
client.on('error', (e) => console.error(e))

client.on('ipChange', (newIP, newPort) => {
	config.update('companion', { host: newIP, port: newPort }).catch((e) => {
		console.log('Failed to update config file:', e)
	})
})

exitHook(() => {
	console.log('Exiting')
	client.disconnect()
	devices.close().catch(() => null)
	server.close()
})

config
	.read()
	.then((c) => {
		if (cli.input.length > 0) {
			c.companion.host = cli.input[0]
			void config.update('companion', { host: c.companion.host })
			if (cli.input.length > 1) {
				const cli_port = Number(cli.input[1])
				if (isNaN(cli_port)) {
					cli.showHelp(1)
				} else {
					c.companion.port = cli_port
					void config.update('companion', { port: c.companion.port })
				}
				if (cli.input.length > 2) {
					const cli_rest_port = Number(cli.input[2])
					if (isNaN(cli_rest_port)) {
						cli.showHelp(1)
					} else {
						c.rest.port = cli_rest_port
						void config.update('rest', { port: c.rest.port })
					}
				}
			}
		}

		client.connect(c.companion.host, c.companion.port).catch((e) => {
			console.log(`Failed to connect`, e)
		})
		server.open(c.rest.port)
	})
	.catch((err) => {
		console.log(err)
		cli.showHelp(0)
	})
