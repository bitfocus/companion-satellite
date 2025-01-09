/* eslint-disable n/no-process-exit */
import { fs, usePowerShell, argv } from 'zx'
// eslint-disable-next-line n/no-extraneous-import
import electronBuilder from 'electron-builder'

if (process.platform === 'win32') {
	usePowerShell() // to enable powershell
}

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

// perform the electron build
await fs.remove('./electron-output')

const options: electronBuilder.Configuration = {
	publish: [],
	productName: 'Companion Satellite',
	appId: 'remote.companion.bitfocus.no',
	afterSign: 'tools/notarize.cjs',
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
			// const args = configuration.computeSignToolArgs(isWin)

			const args = [
				// `sign`,
				// '/fd',
				// 'SHA256',
				// '/td',
				// 'SHA256',
				// '/tr',
				// 'http://timestamp.digicert.com',
				// '/d',
				// '$Description',
				// '/du',
				// 'https://bitfocus.io',
				// '/f',
				// 'c:\\actions-runner-bitfocusas\\codesign.cer',
				// '/csp',
				// 'eToken Base Cryptographic Provider',
				// '/k',
				// process.env.BF_CODECERT_KEY,
				'c:\\actions-runner-bitfocus\\sign.ps1',
				targetPath,
				`-Description`,
				'Bitfocus Companion Satellite',
			]

			// await retry(
			// 	() =>
			await vm.exec('powershell.exe', args, {
				timeout: 10 * 60 * 1000,
				env: process.env,
			})
			// 2,
			// 15000,
			// 10000,
			// 0,
			// (e: any) => {
			// 	if (
			// 		e.message.includes('The file is being used by another process') ||
			// 		e.message.includes('The specified timestamp server either could not be reached') ||
			// 		e.message.includes('No certificates were found that met all the given criteria.')
			// 	) {
			// 		log.warn(`Attempt to code sign failed, another attempt will be made in 15 seconds: ${e.message}`)
			// 		return true
			// 	}
			// 	return false
			// }
			// )
			//

			// await signWindows(config, packager)
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

// perform the electron build
await electronBuilder.build({
	targets: electronBuilder.Platform.fromString(platformInfo.platform).createTarget(null, platformInfo.arch),
	config: options,
	projectDir: 'satellite',
})
