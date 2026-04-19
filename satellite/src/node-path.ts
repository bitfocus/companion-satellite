import { access } from 'node:fs/promises'
import { join } from 'node:path'
import nodeVersionsJson from '../../assets/nodejs-versions.json' with { type: 'json' }

/**
 * Returns the path to the bundled Node.js binary for the given runtime type, or null if not found.
 *
 * @param runtimeType - The runtime type declared in the module manifest (e.g. 'node22')
 * @param isPackaged - true when running inside a packaged electron app
 */
export async function getNodeJsPath(runtimeType: string, isPackaged: boolean): Promise<string | null> {
	const nodeBinExe = process.platform === 'win32' ? 'node.exe' : 'bin/node'

	if (isPackaged) {
		// process.resourcesPath is set by electron to the resources/ directory
		const resourcesPath = (process as any).resourcesPath as string
		const nodeBin = join(resourcesPath, 'node-runtimes', runtimeType, nodeBinExe)
		try {
			await access(nodeBin)
			return nodeBin
		} catch {
			return null
		}
	} else if (process.env.NODE_ENV === 'development') {
		// Dev (tsx): node binary is in the dev cache
		const nodeVersions = nodeVersionsJson as Record<string, string>
		const version = nodeVersions[runtimeType]
		if (!version) return null
		const repoRoot = join(import.meta.dirname, '../..')
		const platform = process.platform === 'win32' ? 'win32' : process.platform
		const devNodeBin = join(repoRoot, `.cache/node-runtime/${platform}-${process.arch}-${version}`, nodeBinExe)
		try {
			await access(devNodeBin)
			return devNodeBin
		} catch {
			return null
		}
	} else {
		// Pi headless (compiled): node-runtimes/ is two levels up from satellite/dist/
		const nodeBin = join(import.meta.dirname, '../../node-runtimes', runtimeType, nodeBinExe)
		try {
			await access(nodeBin)
			return nodeBin
		} catch {
			return null
		}
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
	} else if (process.env.NODE_ENV === 'development') {
		// Dev: node_modules at workspace root (yarn workspaces)
		return join(import.meta.dirname, '../../node_modules')
	} else {
		// Pi headless (compiled): node_modules is one level up from satellite/dist/
		return join(import.meta.dirname, '../node_modules')
	}
}
