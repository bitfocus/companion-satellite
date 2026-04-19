import { fetch, fs, path, $, usePowerShell } from 'zx'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream'
import { promisify } from 'node:util'
import nodeVersionsJson from '../assets/nodejs-versions.json' with { type: 'json' }

const streamPipeline = promisify(pipeline)

const cacheRoot = path.join(import.meta.dirname, '../.cache')
const cacheDir = path.join(cacheRoot, 'node')
const cacheRuntimeDir = path.join(cacheRoot, 'node-runtime')

export interface NodePlatformInfo {
	/** e.g. 'linux', 'darwin', 'win' */
	runtimePlatform: string
	/** e.g. 'x64', 'arm64', 'armv7l' */
	runtimeArch: string
	/** process.platform equivalent: 'linux', 'darwin', 'win32' */
	nodePlatform: string
	/** process.arch equivalent: 'x64', 'arm64', 'arm' */
	nodeArch: string
}

export function currentPlatformInfo(): NodePlatformInfo {
	return platformInfoFromStrings(process.platform, process.arch)
}

export function platformInfoFromStrings(platform: string, arch: string): NodePlatformInfo {
	const key = `${platform}-${arch}`
	switch (key) {
		case 'linux-x64':
			return { runtimePlatform: 'linux', runtimeArch: 'x64', nodePlatform: 'linux', nodeArch: 'x64' }
		case 'linux-arm64':
			return { runtimePlatform: 'linux', runtimeArch: 'arm64', nodePlatform: 'linux', nodeArch: 'arm64' }
		case 'linux-arm':
		case 'linux-armv7l':
			return { runtimePlatform: 'linux', runtimeArch: 'armv7l', nodePlatform: 'linux', nodeArch: 'arm' }
		case 'darwin-x64':
			return { runtimePlatform: 'darwin', runtimeArch: 'x64', nodePlatform: 'darwin', nodeArch: 'x64' }
		case 'darwin-arm64':
			return { runtimePlatform: 'darwin', runtimeArch: 'arm64', nodePlatform: 'darwin', nodeArch: 'arm64' }
		case 'win32-x64':
			return { runtimePlatform: 'win', runtimeArch: 'x64', nodePlatform: 'win32', nodeArch: 'x64' }
		default:
			throw new Error(`Unsupported platform/arch: ${key}`)
	}
}

/**
 * Downloads and extracts all node versions listed in assets/nodejs-versions.json
 * for the given platform. Returns a map of version name -> extracted directory path.
 */
export async function fetchNodejs(platformInfo: NodePlatformInfo): Promise<Map<string, string>> {
	if (process.platform === 'win32') {
		usePowerShell()
	}

	await fs.mkdirp(cacheDir)
	await fs.mkdirp(cacheRuntimeDir)

	const results = await Promise.all(
		Object.entries(nodeVersionsJson).map(async ([name, version]) => {
			const runtimeDir = await fetchSingleVersion(platformInfo, version)
			return [name, runtimeDir] as [string, string]
		}),
	)

	return new Map(results)
}

async function fetchSingleVersion(platformInfo: NodePlatformInfo, nodeVersion: string): Promise<string> {
	const isZip = platformInfo.runtimePlatform === 'win'

	const tarFilename = `node-v${nodeVersion}-${platformInfo.runtimePlatform}-${platformInfo.runtimeArch}.${isZip ? 'zip' : 'tar.gz'}`
	const tarPath = path.join(cacheDir, tarFilename)

	if (!(await fs.pathExists(tarPath))) {
		const tarUrl = `https://nodejs.org/download/release/v${nodeVersion}/${tarFilename}`
		console.log(`Downloading Node.js ${nodeVersion} for ${platformInfo.runtimePlatform}-${platformInfo.runtimeArch}...`)

		const response = await fetch(tarUrl)
		if (!response.ok || !response.body) throw new Error(`Failed to download ${tarUrl}: ${response.statusText}`)
		await streamPipeline(response.body, createWriteStream(tarPath))
	}

	const runtimeDir = path.join(cacheRuntimeDir, `${platformInfo.nodePlatform}-${platformInfo.nodeArch}-${nodeVersion}`)

	if (!(await fs.pathExists(runtimeDir))) {
		console.log(`Extracting Node.js ${nodeVersion}...`)

		if (isZip) {
			const tmpDir = path.join(cacheRuntimeDir, `tmp-${nodeVersion}`)
			await fs.remove(tmpDir)
			if (process.platform === 'win32') {
				await $`Expand-Archive ${tarPath} -DestinationPath ${tmpDir}`
			} else {
				await $`unzip ${tarPath} -d ${tmpDir}`
			}
			await fs.move(
				path.join(tmpDir, `node-v${nodeVersion}-${platformInfo.runtimePlatform}-${platformInfo.runtimeArch}`),
				runtimeDir,
			)
			await fs.remove(tmpDir)
			await fs.remove(path.join(runtimeDir, 'node_modules/npm'))
			await fs.remove(path.join(runtimeDir, 'npm'))
			await fs.remove(path.join(runtimeDir, 'npx'))
		} else {
			await fs.mkdirp(runtimeDir)
			await $`tar -xzf ${tarPath} --strip-components=1 -C ${runtimeDir}`
			await fs.remove(path.join(runtimeDir, 'lib/node_modules/npm'))
			if (platformInfo.runtimePlatform === 'darwin') {
				await fs.remove(path.join(runtimeDir, 'bin/npm'))
				await fs.remove(path.join(runtimeDir, 'bin/npx'))
			}
		}

		await fs.remove(path.join(runtimeDir, 'share'))
		await fs.remove(path.join(runtimeDir, 'include'))

		console.log(`Node.js ${nodeVersion} ready at ${runtimeDir}`)
	}

	return runtimeDir
}
