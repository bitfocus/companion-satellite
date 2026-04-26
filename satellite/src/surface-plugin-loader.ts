import { createLogger } from './logging.js'
import { readdir, stat } from 'node:fs/promises'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { ApiSurfacePluginInfo } from './apiTypes.js'
import { validateSurfaceManifest, type SurfaceModuleManifest } from '@companion-surface/host'

const logger = createLogger('SurfacePluginLoader')

export interface LoadedPlugin {
	info: ApiSurfacePluginInfo
	/** Runtime type declared in the manifest (e.g. 'node22'), used to select the Node.js binary */
	runtimeType: string
	/** Absolute path to the plugin package root directory */
	basePath: string
	/** Absolute path to the companion/manifest.json */
	manifestPath: string
	/** Absolute path to the plugin entrypoint file */
	entrypointPath: string
	/** USB device IDs declared in the manifest, for HID pre-filtering */
	usbIds: Array<{ vendorId: number; productIds: number[] }>
}

/**
 * Determine which directory to scan for surface plugin packages.
 *
 * The production directory (`modules/`) is tried first. If it does not exist,
 * the development cache (`.cache/builtin-surfaces/`) is used as a fallback.
 *
 * Both `satellite/src/` (tsx dev) and `satellite/dist/` (compiled prod) sit two
 * levels below the repository root, so `../..` resolves identically in both.
 */
async function findPluginsDir(): Promise<string> {
	const repoRoot = resolve(import.meta.dirname, '../..')
	const prodDir = join(repoRoot, 'modules')
	try {
		const s = await stat(prodDir)
		if (s.isDirectory()) return prodDir
	} catch {
		// fall through to dev path
	}
	return join(repoRoot, '.cache/builtin-surfaces')
}

/**
 * Scan the plugins directory, validate each package's companion/manifest.json,
 * dynamically import the plugin module, and return the results.
 *
 * Duplicate plugin IDs (same `id` in two different directories) are logged as
 * errors and the second occurrence is skipped.
 */
export async function loadSurfacePlugins(): Promise<LoadedPlugin[]> {
	const pluginsDir = await findPluginsDir()
	logger.info(`Scanning for surface plugins in: ${pluginsDir}`)

	let entries: string[]
	try {
		entries = await readdir(pluginsDir)
	} catch (e) {
		logger.warn(`Could not read plugins directory "${pluginsDir}": ${e}`)
		return []
	}

	/** pluginId → directory name of the first occurrence */
	const seenIds = new Map<string, string>()
	const plugins: LoadedPlugin[] = []

	for (const entry of entries) {
		const moduleDir = join(pluginsDir, entry)
		try {
			const s = await stat(moduleDir)
			if (!s.isDirectory()) continue

			const manifestPath = join(moduleDir, 'companion', 'manifest.json')
			let manifest: SurfaceModuleManifest
			try {
				const raw = await readFile(manifestPath, 'utf8')
				manifest = JSON.parse(raw) as SurfaceModuleManifest
				validateSurfaceManifest(manifest, false)
			} catch (e) {
				logger.warn(`Skipping "${entry}": invalid companion/manifest.json: ${e}`)
				continue
			}

			const pluginId = manifest.id

			if (seenIds.has(pluginId)) {
				logger.error(
					`Skipping duplicate plugin id "${pluginId}" from directory "${entry}" (already loaded from "${seenIds.get(pluginId)}")`,
				)
				continue
			}

			// The entrypoint is relative to the companion/ subdirectory
			const companionDir = join(moduleDir, 'companion')
			const entrypointAbsolute = resolve(companionDir, manifest.runtime.entrypoint)
			// Guard against path traversal (e.g. entrypoint: "../../malicious.js").
			const relativeToModule = relative(moduleDir, entrypointAbsolute)
			if (relativeToModule.startsWith('..') || isAbsolute(relativeToModule)) {
				logger.error(
					`Skipping "${entry}": entrypoint "${manifest.runtime.entrypoint}" escapes the plugin directory`,
				)
				continue
			}

			seenIds.set(pluginId, entry)
			plugins.push({
				info: {
					pluginId,
					pluginName: manifest.name,
					version: manifest.version,
				},
				runtimeType: manifest.runtime.type,
				basePath: moduleDir,
				manifestPath: join(companionDir, 'manifest.json'),
				entrypointPath: entrypointAbsolute,
				usbIds: (manifest.usbIds ?? []).map((u) => ({
					vendorId: u.vendorId,
					productIds: u.productIds,
				})),
			})
			logger.debug(`Found plugin: ${pluginId} ("${manifest.name}") from "${entry}"`)
		} catch (e) {
			logger.error(`Failed to load plugin from "${entry}": ${e}`)
		}
	}

	logger.info(`Loaded ${plugins.length} surface plugin(s)`)
	return plugins
}
