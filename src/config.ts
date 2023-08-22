import { promises as fs } from 'fs'
import { parse, stringify } from 'js-ini'

export class Conifg {
	private readonly defaultFilePath = './config/default.ini'
	private readonly configFilePath = './config/user.ini'

	public async read(): Promise<any> {
		const config = parse(await fs.readFile(this.defaultFilePath, 'utf-8')) as any
		await fs
			.readFile(this.configFilePath, 'utf-8')
			.catch((err) => {
				console.log('unable to load user.ini returnning default', err)
			})
			.then((data) => {
				if (data) {
					const userConfig = parse(data) as any
					for (const section in config) {
						if (userConfig[section]) {
							if (typeof config[section] === 'object') {
								for (const key in config[section]) {
									if (userConfig[section][key]) {
										config[section][key] = userConfig[section][key]
									}
								}
							} else {
								config[section] = userConfig[section]
							}
						}
					}
				}
			})

		return config
	}

	async update(section: string, changes: Record<string, any>): Promise<void> {
		const config = await this.read()
		if (!config[section]) {
			config[section] = {}
		}
		for (const key in changes) {
			config[section][key] = changes[key]
		}
		const data = stringify(config)
		fs.writeFile(this.configFilePath, data, 'utf-8').catch((err) => {
			console.log('faild to write config file', err)
		})
	}
}
