import exitHook = require('exit-hook')
import * as meow from 'meow'
import { CompanionSatelliteClient } from './client'
import { DeviceManager } from './devices'
import { DEFAULT_PORT } from './lib'

import { RestServer } from './rest'

const cli = meow(
	`
	Usage
	  $ companion-satellite hostname [port]

	Examples
	  $ companion-satellite 192.168.1.100
	  $ companion-satellite 192.168.1.100 16622
`,
	{}
)

if (cli.input.length === 0) {
	cli.showHelp(0)
}

let port = DEFAULT_PORT
if (cli.input.length > 1) {
	port = Number(cli.input[1])
	if (isNaN(port)) {
		cli.showHelp(1)
	}
}

console.log('Starting')

const client = new CompanionSatelliteClient({ debug: true })
const devices = new DeviceManager(client)
const server = new RestServer(client)

client.on('log', (l) => console.log(l))
client.on('error', (e) => console.error(e))

exitHook(() => {
	console.log('Exiting')
	client.disconnect()
	devices.close()
	server.close()
})

client.connect(cli.input[0], port)
