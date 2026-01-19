/* eslint-disable n/no-process-exit */
import { fs, usePowerShell, argv } from 'zx'
import * as path from 'path'
import { fileURLToPath } from 'url'

import electronBuilder from 'electron-builder'

if (process.platform === 'win32') {
	usePowerShell() // to enable powershell
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const modulesDir = path.join(rootDir, 'modules')
const bundledModulesDir = path.join(rootDir, 'satellite', 'bundled-modules')

const platform = argv._[0] || `${process.platform}-${process.arch}`

let platformInfo: { platform: string; arch: electronBuilder.Arch }
// let nodePreGypArgs: string[] = []

console.log(`Building for platform: ${platform}`)

if (platform === 'mac-x64' || platform === 'darwin-x64') {
	platformInfo = { platform: 'mac', arch: electronBuilder.Arch.x64 }
	// nodePreGypArgs = ['--target_platform=darwin', '--target_arch=x64', '--target_libc=unknown']
} else if (platform === 'mac-arm64' || platform === 'darwin-arm64') {
	platformInfo = { platform: 'mac', arch: electronBuilder.Arch.arm64 }
	// nodePreGypArgs = ['--target_platform=darwin', '--target_arch=arm64', '--target_libc=unknown']
} else if (platform === 'win-x64' || platform === 'win32-x64') {
	platformInfo = { platform: 'win', arch: electronBuilder.Arch.x64 }
	// nodePreGypArgs = ['--target_platform=win32', '--target_arch=x64', '--target_libc=unknown']
} else if (platform === 'linux-x64') {
	platformInfo = { platform: 'linux', arch: electronBuilder.Arch.x64 }
	// nodePreGypArgs = ['--target_platform=linux', '--target_arch=x64', '--target_libc=glibc']
} else if (platform === 'linux-arm7') {
	platformInfo = { platform: 'linux', arch: electronBuilder.Arch.armv7l }
	// nodePreGypArgs = ['--target_platform=linux', '--target_arch=arm', '--target_libc=glibc']
} else if (platform === 'linux-arm64') {
	platformInfo = { platform: 'linux', arch: electronBuilder.Arch.arm64 }
	// nodePreGypArgs = ['--target_platform=linux', '--target_arch=arm64', '--target_libc=glibc']
} else {
	console.error('Unknown platform')
	process.exit(1)
}

// HACK: skip this as it is trying to rebuild everything from source and failing
// if (!platform) {
// 	// If for our own platform, make sure the correct deps are installed
// 	await $`electron-builder install-app-deps`
// }
// console.log('pregyp args:', nodePreGypArgs)

// Copy modules into satellite directory for packaging
// The imports field in package.json points to ../modules/ which is outside the packaged app
// We copy them to ./bundled-modules/ and update the imports field for the build
async function copyModulesForPackaging(): Promise<void> {
	console.log('Copying modules for packaging...')

	// Clean up any previous bundled-modules directory
	await fs.remove(bundledModulesDir)
	await fs.ensureDir(bundledModulesDir)

	if (!(await fs.pathExists(modulesDir))) {
		console.log('No modules directory found, skipping module bundling')
		return
	}

	const entries = await fs.readdir(modulesDir, { withFileTypes: true })

	for (const entry of entries) {
		if (!entry.isDirectory()) continue
		if (!entry.name.startsWith('companion-surface-')) continue

		const srcModulePath = path.join(modulesDir, entry.name)
		const destModulePath = path.join(bundledModulesDir, entry.name)

		// Copy dist directory (compiled plugin code)
		const srcDist = path.join(srcModulePath, 'dist')
		const destDist = path.join(destModulePath, 'dist')
		if (await fs.pathExists(srcDist)) {
			await fs.copy(srcDist, destDist)
		}

		// Copy companion/manifest.json
		const srcManifest = path.join(srcModulePath, 'companion', 'manifest.json')
		const destManifest = path.join(destModulePath, 'companion', 'manifest.json')
		if (await fs.pathExists(srcManifest)) {
			await fs.ensureDir(path.dirname(destManifest))
			await fs.copy(srcManifest, destManifest)
		}

		console.log(`  Copied: ${entry.name}`)
	}
}

async function cleanupBundledModules(): Promise<void> {
	console.log('Cleaning up bundled modules...')
	await fs.remove(bundledModulesDir)
}

// perform the electron build
await fs.remove('./electron-output')

const options: electronBuilder.Configuration = {
	publish: [
		{
			provider: 'generic',
			publishAutoUpdate: false,
			url: 'https://api.bitfocus.io/v1/product/electron-updater/companion-satellite',
		},
	],
	productName: 'Companion Satellite',
	appId: 'remote.companion.bitfocus.no',
	npmRebuild: false,
	directories: {
		buildResources: 'assets/',
		output: '../electron-output/',
	},
	mac: {
		category: 'no.bitfocus.companion.remote',
		target: 'dmg',
		extendInfo: {
			LSBackgroundOnly: 1,
			LSUIElement: 1,
		},
		hardenedRuntime: true,
		gatekeeperAssess: false,
		entitlements: 'satellite/entitlements.mac.plist',
		entitlementsInherit: 'satellite/entitlements.mac.plist',
	},
	dmg: {
		artifactName: 'companion-satellite-${arch}.dmg',
		sign: !!process.env.CSC_LINK, // Only sign in ci
	},
	win: {
		target: 'nsis',
		verifyUpdateCodeSignature: false, // Enabling this would need publishedName to be set, not sure if that is possible
		signtoolOptions: {
			signingHashAlgorithms: ['sha256'],

			sign: async function sign(config, packager) {
				// Do not sign if no certificate is provided.
				if (!config.cscInfo) {
					return
				}

				if (!packager) throw new Error('Packager is required')

				const targetPath = config.path
				// Do not sign elevate file, because that prompts virus warning?
				if (targetPath.endsWith('elevate.exe')) {
					return
				}

				if (!process.env.BF_CODECERT_KEY) throw new Error('BF_CODECERT_KEY variable is not set')

				const vm = await packager.vm.value
				await vm.exec(
					'powershell.exe',
					['c:\\actions-runner-bitfocus\\sign.ps1', targetPath, `-Description`, 'Bitfocus Companion Satellite'],
					{
						timeout: 10 * 60 * 1000,
						env: process.env,
					},
				)
			},
		},
	},
	nsis: {
		createStartMenuShortcut: true,
		perMachine: true,
		oneClick: false,
		allowElevation: true,
		artifactName: 'companion-satellite-x64.exe',
	},
	linux: {
		target: 'tar.gz',
		artifactName: 'companion-satellite-${arch}.tar.gz',
		extraFiles: [
			{
				from: 'assets/linux',
				to: '.',
			},
		],
	},
	files: ['**/*', 'assets/*', '!.nvmrc', '!.node_version', '!docs', '!samples', '!src', '!tools', '!pi-image'],
	extraResources: [
		{
			from: '../webui/dist',
			to: 'webui',
		},
	],
}

const satellitePkgJsonPath = new URL('../satellite/package.json', import.meta.url)
const satellitePkgJsonStr = await fs.readFile(satellitePkgJsonPath)

const satellitePkgJson = JSON.parse(satellitePkgJsonStr.toString())
satellitePkgJson.updateChannel = process.env.EB_UPDATE_CHANNEL
console.log('Injecting update channel: ' + satellitePkgJson.updateChannel)

if (process.env.BUILD_VERSION) satellitePkgJson.version = process.env.BUILD_VERSION

// Update imports field to use bundled modules path instead of ../modules/
// This is necessary because electron-builder only packages the satellite directory
if (satellitePkgJson.imports) {
	console.log('Updating imports field for production build...')
	const newImports: Record<string, string> = {}
	for (const [key, value] of Object.entries(satellitePkgJson.imports)) {
		if (typeof value === 'string' && value.startsWith('../modules/')) {
			newImports[key] = value.replace('../modules/', './bundled-modules/')
		} else {
			newImports[key] = value as string
		}
	}
	satellitePkgJson.imports = newImports
}

// Copy modules into satellite directory for packaging
await copyModulesForPackaging()

await fs.writeFile(satellitePkgJsonPath, JSON.stringify(satellitePkgJson))

try {
	// perform the electron build
	await electronBuilder.build({
		targets: electronBuilder.Platform.fromString(platformInfo.platform).createTarget(null, platformInfo.arch),
		config: options,
		projectDir: 'satellite',
	})
} finally {
	// undo the changes made
	await fs.writeFile(satellitePkgJsonPath, satellitePkgJsonStr)

	// Clean up bundled modules
	await cleanupBundledModules()
}
