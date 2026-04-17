import { access } from 'node:fs/promises'
import { join } from 'node:path'
import nodeVersionsJson from '../../assets/nodejs-versions.json' with { type: 'json' }

const RUNTIME_TYPE = 'node22'

/**
 * Returns the path to the bundled Node.js binary, or null if not found.
 *
 * @param isPackaged - true when running inside a packaged electron app
 */
export async function getNodeJsPath(isPackaged: boolean): Promise<string | null> {
	let nodeBinDir: string

	if (isPackaged) {
		// process.resourcesPath is set by electron to the resources/ directory
		const resourcesPath = (process as any).resourcesPath as string
		nodeBinDir = join(resourcesPath, 'node-runtimes', RUNTIME_TYPE)
	} else {
		const version = (nodeVersionsJson as Record<string, string>)[RUNTIME_TYPE]
		if (!version) return null

		// From satellite/src/ or satellite/dist/ → ../../ = companion-satellite root
		const repoRoot = join(import.meta.dirname, '../..')

		// Check the pi-deployment path first (node-runtimes/ at repo root)
		const piNodeBin = join(
			repoRoot,
			'node-runtimes',
			RUNTIME_TYPE,
			process.platform === 'win32' ? 'node.exe' : 'bin/node',
		)
		try {
			await access(piNodeBin)
			return piNodeBin
		} catch {
			// fall through to dev cache
		}

		const platform = process.platform === 'win32' ? 'win32' : process.platform
		const arch = process.arch
		nodeBinDir = join(repoRoot, `.cache/node-runtime/${platform}-${arch}-${version}`)
	}

	const nodeBin = join(nodeBinDir, process.platform === 'win32' ? 'node.exe' : 'bin/node')

	try {
		await access(nodeBin)
		return nodeBin
	} catch {
		return null
	}
}

/**
 * Returns the path to the surface-thread entrypoint bundle.
 *
 * @param isPackaged - true when running inside a packaged electron app
 */
export function getSurfaceEntrypointPath(isPackaged: boolean): string {
	if (isPackaged) {
		const resourcesPath = (process as any).resourcesPath as string
		return join(resourcesPath, 'surface-entrypoint.cjs')
	} else if (process.env.NODE_ENV === 'development') {
		// Dev (tsx): use tsc-compiled output
		return join(import.meta.dirname, '../dist/surface-thread/entrypoint.js')
	} else {
		// Pi headless (compiled): surface-entrypoint.cjs is in the same dist/ dir as this file
		return join(import.meta.dirname, 'surface-entrypoint.cjs')
	}
}

/**
 * Returns the NODE_PATH value to use when spawning the surface child process,
 * so it can resolve @companion-surface/host and other non-native deps.
 *
 * @param isPackaged - true when running inside a packaged electron app
 */
export function getChildNodePath(isPackaged: boolean): string {
	if (isPackaged) {
		const resourcesPath = (process as any).resourcesPath as string
		return join(resourcesPath, 'app.asar.unpacked', 'node_modules')
	} else {
		const repoRoot = join(import.meta.dirname, '../..')
		return join(repoRoot, 'node_modules')
	}
}
