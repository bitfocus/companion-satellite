#!/usr/bin/env zx

function $withoutEscaping(pieces, ...args) {
	const origQuote = $.quote
	try {
		$.quote = (unescapedCmd) => unescapedCmd
		return $(pieces, args)
	} finally {
		$.quote = origQuote
	}
}

const platform = argv._[0]

let electronBuilderArgs = []
let sharpPlatform = null
let sharpArch = null

if (!platform) {
	console.log('No platform specified, building for current')
} else {
	console.log(`Building for platform: ${platform}`)

	if (platform === 'mac-x64') {
		electronBuilderArgs.push('--x64', '--mac')
		sharpPlatform = 'darwin'
		sharpArch = 'x64'
	} else if (platform === 'mac-arm64') {
		electronBuilderArgs.push('--arm64', '--mac')
		sharpPlatform = 'darwin'
		sharpArch = 'arm64'
	} else if (platform === 'win-x64') {
		electronBuilderArgs.push('--x64', '--win')
		sharpPlatform = 'win32'
		sharpArch = 'x64'
	} else if (platform === 'linux-x64') {
		electronBuilderArgs.push('--x64', '--linux')
		sharpPlatform = 'linux'
		sharpArch = 'x64'
	} else if (platform === 'linux-arm7') {
		electronBuilderArgs.push('--armv7l', '--linux')
		sharpPlatform = 'linux'
		sharpArch = 'arm'
	} else {
		console.error('Unknown platform')
		process.exit(1)
	}
}

// Ensure we have the correct sharp libs
let sharpArgs = []
if (sharpPlatform) sharpArgs.push(`npm_config_platform=${sharpPlatform}`)
if (sharpArch) sharpArgs.push(`npm_config_arch=${sharpArch}`)
await $`cross-env ${sharpArgs} yarn dist:prepare:sharp`

const sharpVendorDir = './node_modules/sharp/vendor/'
const sharpVersionDirs = await fs.readdir(sharpVendorDir)
if (sharpVersionDirs.length !== 1) {
	console.error(`Failed to determine sharp lib version`)
	process.exit(1)
}

const sharpPlatformDirs = await fs.readdir(path.join(sharpVendorDir, sharpVersionDirs[0]))
if (sharpPlatformDirs.length !== 1) {
	console.error(`Failed to determine sharp lib platform`)
	process.exit(1)
}

const vipsVendorName = path.join(sharpVersionDirs[0], sharpPlatformDirs[0])
process.env.VIPS_VENDOR = vipsVendorName

// HACK: skip this as it is trying to rebuild everything from source and failing
// if (!platform) {
// 	// If for our own platform, make sure the correct deps are installed
// 	await $`electron-builder install-app-deps`
// }

// perform the electron build
await fs.remove('./electron-output')
await $withoutEscaping` electron-builder --publish=never ${electronBuilderArgs.join(' ')} `
