import { createLogger } from './logging.js'
import { readdir, stat } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFile } from 'node:fs/promises'
import type { ApiSurfacePluginInfo } from './apiTypes.js'
import { validateSurfaceManifest, type SurfaceModuleManifest, type SurfacePlugin } from '@companion-surface/base'

const logger = createLogger('SurfacePluginLoader')

export interface LoadedPlugin {
	info: ApiSurfacePluginInfo
	plugin: SurfacePlugin<unknown>
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
	const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
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
			const entrypointAbsolute = resolve(join(moduleDir, 'companion'), manifest.runtime.entrypoint)
			let pluginDefault: SurfacePlugin<unknown>
			try {
				const mod = (await import(pathToFileURL(entrypointAbsolute).href)) as {
					default: SurfacePlugin<unknown>
				}
				pluginDefault = mod.default
			} catch (e) {
				logger.error(`Skipping "${entry}": failed to import plugin from "${entrypointAbsolute}": ${e}`)
				continue
			}

			if (!pluginDefault) {
				logger.error(`Skipping "${entry}": plugin module has no default export`)
				continue
			}

			seenIds.set(pluginId, entry)
			plugins.push({
				info: {
					pluginId,
					pluginName: manifest.name,
					version: manifest.version,
				},
				plugin: pluginDefault,
			})
			logger.debug(`Loaded plugin: ${pluginId} ("${manifest.name}") from "${entry}"`)
		} catch (e) {
			logger.error(`Failed to load plugin from "${entry}": ${e}`)
		}
	}

	logger.info(`Loaded ${plugins.length} surface plugin(s)`)
	return plugins
}
