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

if (!platform) {
	console.log('No platform specified, building for current')
} else {
	console.log(`Building for platform: ${platform}`)

	if (platform === 'mac-x64') {
		electronBuilderArgs.push('--x64', '--mac')
	} else if (platform === 'mac-arm64') {
		electronBuilderArgs.push('--arm64', '--mac')
	} else if (platform === 'win-x64') {
		electronBuilderArgs.push('--x64', '--win')
	} else if (platform === 'linux-x64') {
		electronBuilderArgs.push('--x64', '--linux')
	} else if (platform === 'linux-arm7') {
		electronBuilderArgs.push('--armv7l', '--linux')
	} else {
		console.error('Unknown platform')
		process.exit(1)
	}
}

// HACK: skip this as it is trying to rebuild everything from source and failing
// if (!platform) {
// 	// If for our own platform, make sure the correct deps are installed
// 	await $`electron-builder install-app-deps`
// }

// perform the electron build
await fs.remove('./electron-output')
await $withoutEscaping` electron-builder --publish=never ${electronBuilderArgs.join(' ')} `
