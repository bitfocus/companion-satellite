import * as meow from 'meow'
import { init } from './app'

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

const client = init()
client.connect(cli.input[0])
