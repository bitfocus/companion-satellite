/* eslint-disable n/no-process-exit */
import { fs, $, usePowerShell, argv } from 'zx'
import electronBuilder from 'electron-builder'

if (process.platform === 'win32') {
	usePowerShell() // to enable powershell
}

function $withoutEscaping(pieces, ...args) {
	const origQuote = $.quote
	try {
		$.quote = (unescapedCmd) => unescapedCmd
		return $(pieces, args)
	} finally {
		$.quote = origQuote
	}
}

const platform = argv._[0] || `${process.platform}-${process.arch}`

let platformInfo: { platform: string; arch: electronBuilder.Arch }
// let electronBuilderArgs: string[] = []
// let nodePreGypArgs: string[] = []

console.log(`Building for platform: ${platform}`)

if (platform === 'mac-x64') {
	platformInfo = { platform: 'mac', arch: electronBuilder.Arch.x64 }
	// nodePreGypArgs = ['--target_platform=darwin', '--target_arch=x64', '--target_libc=unknown']
} else if (platform === 'mac-arm64') {
	platformInfo = { platform: 'mac', arch: electronBuilder.Arch.arm64 }
	// nodePreGypArgs = ['--target_platform=darwin', '--target_arch=arm64', '--target_libc=unknown']
} else if (platform === 'win-x64') {
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
	publish: 'never',
	productName: 'Companion Satellite',
	appId: 'remote.companion.bitfocus.no',
	afterSign: '../tools/notarize.cjs',
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
		sign: true,
	},
	win: {
		target: 'nsis',
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
