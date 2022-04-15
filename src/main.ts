import exitHook from 'exit-hook'
import meow from 'meow'
import { CompanionSatelliteClient } from './client.js'
import { DeviceManager } from './devices.js'
import { DEFAULT_PORT } from './lib.js'

const cli = meow(
	`
	Usage
	  $ companion-satellite hostname [port]

	Examples
	  $ companion-satellite 192.168.1.100
	  $ companion-satellite 192.168.1.100 16622
`,
	{
		importMeta: import.meta,
	}
)

if (cli.input.length === 0) {
	cli.showHelp(0)
}

let port = DEFAULT_PORT
if (cli.input.length > 1) {
	port = Number(cli.input[0])
	if (isNaN(port)) {
		cli.showHelp(1)
	}
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

client.connect(cli.input[0], port)
