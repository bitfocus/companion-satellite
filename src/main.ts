import exitHook = require('exit-hook')
import * as meow from 'meow'
import { CompanionSatelliteClient } from './client'
import { DeviceManager } from './devices'
import { DEFAULT_PORT } from './lib'

import { RestServer } from './rest'
import * as fs from 'fs'

const cli = meow(
	`
	Usage
	  $ companion-satellite hostname [port] [REST port]

	Examples
	  $ companion-satellite 192.168.1.100
	  $ companion-satellite 192.168.1.100 16622
	  $ companion-satellite 192.168.1.100 16622 9999
`,
	{}
)

if (cli.input.length === 0) {
	cli.showHelp(0)
}

let port = DEFAULT_PORT
let rest_port = 0
if (cli.input.length > 1) {
	port = Number(cli.input[1])
	if (isNaN(port)) {
		cli.showHelp(1)
	}
	if (cli.input.length > 2) {
		rest_port = Number(cli.input[2])
		if (isNaN(rest_port)) {
			cli.showHelp(1)
		}
	}
}

console.log('Starting')

const client = new CompanionSatelliteClient({ debug: true })
const devices = new DeviceManager(client)
const server = new RestServer(client)

client.on('log', (l) => console.log(l))
client.on('error', (e) => console.error(e))

const configFilePath = process.env.SATELLITE_CONFIG_PATH
if (configFilePath) {
	// Update the config file on changes, if a path is provided
	client.on('ipChange', (newIP, newPort) => {
		updateEnvironmentFile(configFilePath, { COMPANION_IP: newIP, COMPANION_PORT: String(newPort) })
	})
}

exitHook(() => {
	console.log('Exiting')
	client.disconnect()
	devices.close()
	server.close()
})

client.connect(cli.input[0], port)
server.open(rest_port)

function updateEnvironmentFile(filePath: string, changes: Record<string, string>): void {
	fs.access(filePath, (err: any) => {
		if (err) {
			console.log(err)
		} else {
			fs.readFile(filePath, 'utf-8', function (err: any, data: string) {
				if (err) {
					console.error(err)
				}
				else {
					let lines = data.split(/\r?\n/)

					for (let i = 0; i < lines.length; i++) {
						for (const key in changes) {
							if (lines[i].startsWith(key)) {
								lines[i] = key + '=' + changes[key]
							}
						}
					}

					let newData = lines.join('\n')

					fs.writeFile(filePath, newData, 'utf-8', function (err: any) {
						if (err) {
							console.error(err)
						}
					});
				}

			})
		}
	})
}