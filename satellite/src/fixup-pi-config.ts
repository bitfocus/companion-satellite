/**
 * This is a small pre-launch step that gets run on SatellitePi.
 * It's purpose is to import user defined overrides from the 'boot' partition
 * Note: This gets run as root!
 */

import { stat, readFile, copyFile, chown } from 'fs/promises'
import { openHeadlessConfig } from './config.js'
import { fileURLToPath } from 'url'

const configFilePath = process.argv[2]
if (!configFilePath) throw new Error(`Missing config file path parameter`)

const appConfig = openHeadlessConfig(configFilePath)

// Ensure the satellite user owns the file. This is a bit dodgey guessing the ids like this..
chown(appConfig.path, 1000, 1000).catch(() => null)

const templatePathName = fileURLToPath(
	new URL('/usr/local/src/companion-satellite/pi-image/satellite-config', import.meta.url),
)

const importFromPaths = [
	// Paths to search for a config file to 'import' from
	'/boot/satellite-config',
	'/boot/firmware/satellite-config',
	'/satellite-config',
	// templatePathName, // For testing
]

Promise.resolve()
	.then(async () => {
		for (const importPath of importFromPaths) {
			try {
				const fileStat = await stat(importPath)
				if (!fileStat.isFile()) throw new Error('Not a file')

				const fileContentStr = await readFile(importPath)
				const lines = fileContentStr.toString().split('\n')

				console.log(`Importing config from ${importPath}`)

				for (let line of lines) {
					line = line.trim()

					// Ignore any comments
					if (line.startsWith('#')) continue

					const splitIndex = line.indexOf('=')
					if (splitIndex == -1) continue

					const key = line.slice(0, splitIndex).trim()
					const value = line.slice(splitIndex + 1).trim()

					switch (key.toUpperCase()) {
						case 'COMPANION_IP':
							appConfig.set('remoteIp', value)
							break
						case 'COMPANION_PORT': {
							const port = Number(value)
							if (isNaN(port)) {
								console.log('COMPANION_PORT is not a number!')
								break
							}
							appConfig.set('remotePort', port)
							break
						}
						case 'REST_PORT': {
							const port = Number(value)
							if (isNaN(port)) {
								console.log('REST_PORT is not a number!')
								break
							}
							if (port > 0) {
								appConfig.set('restPort', port)
								appConfig.set('restEnabled', true)
							} else {
								appConfig.set('restEnabled', false)
							}
							break
						}
						default:
							console.log(`Unknown value: ${key}=${value}`)
							break
					}
				}

				if (templatePathName !== importPath) {
					await copyFile(templatePathName, importPath)
				}
			} catch (e: any) {
				if (e.code === 'ENOENT') continue
				// Failed, try next file
				console.log(`Unable to import from file "${importPath}"`, e)
			}
		}
	})
	.catch(() => {
		// Ignore
	})
