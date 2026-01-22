import fs from 'fs'
import path from 'path'
import * as semver from 'semver'
import { createLogger } from '../logging.js'
import type { InstalledModule, SurfaceModuleManifest } from './types.js'

/**
 * Service for scanning and discovering installed surface modules
 */
export class ModuleScanner {
	readonly #logger = createLogger('ModuleScanner')

	/**
	 * Scan a directory for installed modules
	 */
	async scanDirectory(searchDir: string): Promise<InstalledModule[]> {
		if (!fs.existsSync(searchDir)) {
			this.#logger.debug(`Directory does not exist: ${searchDir}`)
			return []
		}

		const modules: InstalledModule[] = []

		try {
			const entries = fs.readdirSync(searchDir, { withFileTypes: true })

			for (const entry of entries) {
				if (!entry.isDirectory()) continue

				const modulePath = path.join(searchDir, entry.name)
				const module = await this.loadModuleInfo(modulePath)

				if (module) {
					modules.push(module)
				}
			}
		} catch (e) {
			this.#logger.error(`Failed to scan directory: ${e}`)
		}

		return modules
	}

	/**
	 * Load information about a single module from its directory
	 */
	async loadModuleInfo(modulePath: string): Promise<InstalledModule | null> {
		try {
			const manifestPath = path.join(modulePath, 'companion', 'manifest.json')

			if (!fs.existsSync(manifestPath)) {
				this.#logger.debug(`Ignoring "${modulePath}", no manifest found`)
				return null
			}

			const manifestContent = fs.readFileSync(manifestPath, 'utf8')
			const manifest = JSON.parse(manifestContent) as SurfaceModuleManifest

			// Validate it's a surface module
			if (manifest.type !== 'surface') {
				this.#logger.debug(`Ignoring "${modulePath}", not a surface module`)
				return null
			}

			// Validate required fields
			if (!manifest.id || !manifest.version || !manifest.runtime?.entrypoint) {
				this.#logger.warn(`Invalid manifest in "${modulePath}": missing required fields`)
				return null
			}

			// Validate version is valid semver
			if (!semver.parse(manifest.version, { loose: true })) {
				this.#logger.warn(`Invalid version "${manifest.version}" in "${modulePath}"`)
				return null
			}

			const module: InstalledModule = {
				id: manifest.id,
				version: manifest.version,
				path: path.resolve(modulePath),
				manifest,
				isBeta: !!manifest.isPrerelease,
			}

			this.#logger.debug(`Found module ${manifest.id}@${manifest.version}`)
			return module
		} catch (e) {
			this.#logger.error(`Failed to load module from "${modulePath}": ${e}`)
			return null
		}
	}

	/**
	 * Get the entrypoint path for a module
	 * The entrypoint in manifest is relative to the companion/ directory
	 */
	getEntrypointPath(module: InstalledModule): string {
		const companionDir = path.join(module.path, 'companion')
		return path.resolve(companionDir, module.manifest.runtime.entrypoint)
	}

	/**
	 * Validate that a module's entrypoint exists
	 */
	validateEntrypoint(module: InstalledModule): boolean {
		const entrypoint = this.getEntrypointPath(module)
		return fs.existsSync(entrypoint)
	}

	/**
	 * Group modules by ID, keeping track of all installed versions
	 */
	groupModulesById(modules: InstalledModule[]): Map<string, InstalledModule[]> {
		const grouped = new Map<string, InstalledModule[]>()

		for (const module of modules) {
			const existing = grouped.get(module.id) ?? []
			existing.push(module)
			grouped.set(module.id, existing)
		}

		// Sort versions descending for each module
		for (const versions of grouped.values()) {
			versions.sort((a, b) => semver.rcompare(a.version, b.version))
		}

		return grouped
	}

	/**
	 * Get the latest version of each module
	 */
	getLatestVersions(modules: InstalledModule[]): InstalledModule[] {
		const grouped = this.groupModulesById(modules)
		const latest: InstalledModule[] = []

		for (const versions of grouped.values()) {
			if (versions.length > 0) {
				latest.push(versions[0])
			}
		}

		return latest
	}
}
