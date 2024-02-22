#!/usr/bin/env zx

import { fetch, fs } from 'zx'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream'
import { promisify } from 'node:util'
const streamPipeline = promisify(pipeline)

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

if (platform === 'win-x64' || process.platform === 'win32') {
	const localRedistPath = '.cache/vc_redist.x64.exe'
	if (!(await fs.pathExists(localRedistPath))) {
		await fs.mkdirp('.cache')

		const response = await fetch('https://aka.ms/vs/17/release/vc_redist.x64.exe')
		if (!response.ok) throw new Error(`unexpected response ${response.statusText}`)
		await streamPipeline(response.body, createWriteStream('.cache/vc_redist.x64.exe'))
	}
}

// Force reinstall @julusian/skia-canvas, so that it is the correct arch
if (nodePreGypArgs.length) {
	await $`yarn --cwd node_modules/@julusian/skia-canvas run install --update-binary ${nodePreGypArgs}`
}

// HACK: skip this as it is trying to rebuild everything from source and failing
// if (!platform) {
// 	// If for our own platform, make sure the correct deps are installed
// 	await $`electron-builder install-app-deps`
// }

// perform the electron build
await fs.remove('./electron-output')
await $withoutEscaping`yarn workspace satellite build:electron ${electronBuilderArgs.join(' ')} `
