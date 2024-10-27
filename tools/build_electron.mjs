#!/usr/bin/env zx

import { fs } from 'zx'

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

const platform = argv._[0]

let electronBuilderArgs = []
let nodePreGypArgs = []

if (!platform) {
	console.log('No platform specified, building for current')
} else {
	console.log(`Building for platform: ${platform}`)

	if (platform === 'mac-x64') {
		electronBuilderArgs.push('--x64', '--mac')
		nodePreGypArgs = ['--target_platform=darwin', '--target_arch=x64', '--target_libc=unknown']
	} else if (platform === 'mac-arm64') {
		electronBuilderArgs.push('--arm64', '--mac')
		nodePreGypArgs = ['--target_platform=darwin', '--target_arch=arm64', '--target_libc=unknown']
	} else if (platform === 'win-x64') {
		electronBuilderArgs.push('--x64', '--win')
		nodePreGypArgs = ['--target_platform=win32', '--target_arch=x64', '--target_libc=unknown']
	} else if (platform === 'linux-x64') {
		electronBuilderArgs.push('--x64', '--linux')
		nodePreGypArgs = ['--target_platform=linux', '--target_arch=x64', '--target_libc=glibc']
	} else if (platform === 'linux-arm7') {
		electronBuilderArgs.push('--armv7l', '--linux')
		nodePreGypArgs = ['--target_platform=linux', '--target_arch=arm', '--target_libc=glibc']
	} else if (platform === 'linux-arm64') {
		electronBuilderArgs.push('--arm64', '--linux')
		nodePreGypArgs = ['--target_platform=linux', '--target_arch=arm64', '--target_libc=glibc']
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
await $withoutEscaping`yarn workspace satellite build:electron ${electronBuilderArgs.join(' ')} `
