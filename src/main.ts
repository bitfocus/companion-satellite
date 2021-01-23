import exitHook = require('exit-hook')
import * as meow from 'meow'
import { CompanionSatelliteClient } from './client'
import { DeviceManager } from './devices'

const cli = meow(
	`
	Usage
	  $ companion-remote hostname

	Examples
	  $ companion-remote 192.168.1.100
`,
	{}
)

if (cli.input.length === 0) {
	cli.showHelp(0)
}

console.log('Starting')

const client = new CompanionSatelliteClient({ debug: true })
const devices = new DeviceManager(client)

client.on('log', (l) => console.log(l))
client.on('error', (e) => console.error(e))

exitHook(() => {
	console.log('Exiting')
	client.disconnect()
	devices.close()
})

client.connect(cli.input[0])

devices
