import path from 'path'
import os from 'os'
import { EventEmitter } from 'events'
import type { SurfacePlugin } from '@companion-surface/base'
import { createLogger } from '../logging.js'
import { ModuleCache } from './ModuleCache.js'
import { ModuleStoreService } from './ModuleStoreService.js'
import { ModuleInstaller } from './ModuleInstaller.js'
import { ModuleScanner } from './ModuleScanner.js'
import type { InstalledModule, ModuleStoreEntry, ModuleUpdateInfo } from './types.js'

// Default modules to install on first run
const DEFAULT_MODULES = ['elgato-stream-deck', 'loupedeck', 'idisplay-infinitton']

export interface LoadedPlugin {
	info: {
		pluginId: string
		pluginName: string
	}
	plugin: SurfacePlugin<unknown>
	module: InstalledModule
}

export type ModuleManagerEvents = {
	modulesLoaded: [plugins: LoadedPlugin[]]
	moduleInstalled: [module: InstalledModule]
	moduleUninstalled: [moduleId: string, version: string]
	storeListUpdated: []
}

/**
 * Manages surface module lifecycle:
 * - Discovery of installed modules
 * - Installation from the Bitfocus Module Store
 * - Dynamic loading of plugin code
 */
export class ModuleManager extends EventEmitter<ModuleManagerEvents> {
	readonly #logger = createLogger('ModuleManager')
	readonly #cache: ModuleCache
	readonly #storeService: ModuleStoreService
	readonly #installer: ModuleInstaller
	readonly #scanner: ModuleScanner
	#loadedPlugins: LoadedPlugin[] = []
	#installedModules = new Map<string, InstalledModule>()
	#isInitialized = false

	constructor(configDir: string, appVersion: string) {
		super()
		this.setMaxListeners(0)

		// Initialize components
		this.#cache = new ModuleCache(configDir)
		this.#storeService = new ModuleStoreService(this.#cache, appVersion)
		this.#installer = new ModuleInstaller(path.join(configDir, 'surfaces'), this.#storeService, appVersion)
		this.#scanner = new ModuleScanner()

		// Forward store list updates
		this.#storeService.on('storeListUpdated', () => {
			this.emit('storeListUpdated')
		})
	}

	/**
	 * Get the default config directory path
	 */
	static getDefaultConfigDir(): string {
		// Follow XDG spec on Linux, use platform-specific paths elsewhere
		if (process.platform === 'linux') {
			const xdgConfig = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config')
			return path.join(xdgConfig, 'companion-satellite')
		} else if (process.platform === 'darwin') {
			return path.join(os.homedir(), 'Library', 'Application Support', 'companion-satellite')
		} else if (process.platform === 'win32') {
			const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
			return path.join(appData, 'companion-satellite')
		}
		// Fallback
		return path.join(os.homedir(), '.companion-satellite')
	}

	/**
	 * Initialize the module manager
	 * - Scans for installed modules
	 * - Downloads default modules on first run
	 * - Loads all plugin code
	 */
	async init(): Promise<void> {
		if (this.#isInitialized) return

		this.#logger.info('Initializing module manager')

		// Initialize the installer (creates directories)
		await this.#installer.init()

		// Scan for installed modules
		const installedModules = await this.#scanner.scanDirectory(this.#installer.modulesDir)
		this.#logger.info(`Found ${installedModules.length} installed modules`)

		// Group by ID and get latest versions
		for (const module of installedModules) {
			const key = `${module.id}@${module.version}`
			this.#installedModules.set(key, module)
		}

		// Check if this is a first run (no modules installed)
		if (installedModules.length === 0) {
			this.#logger.info('First run detected, downloading default modules')
			await this.#installDefaultModules()
		}

		// Load all installed modules
		await this.#loadAllModules()

		this.#isInitialized = true
		this.#logger.info(`Module manager initialized with ${this.#loadedPlugins.length} plugins`)
	}

	/**
	 * Install default modules on first run
	 */
	async #installDefaultModules(): Promise<void> {
		// Refresh store list first
		await this.#storeService.refreshStoreList()

		for (const moduleId of DEFAULT_MODULES) {
			try {
				this.#logger.info(`Installing default module: ${moduleId}`)
				const result = await this.#installer.installFromStore(moduleId)
				if (result.success && result.module) {
					const key = `${result.module.id}@${result.module.version}`
					this.#installedModules.set(key, result.module)
				} else {
					this.#logger.warn(`Failed to install ${moduleId}: ${result.error}`)
				}
			} catch (e) {
				this.#logger.error(`Error installing ${moduleId}: ${e}`)
			}
		}
	}

	/**
	 * Load plugin code from all installed modules
	 */
	async #loadAllModules(): Promise<void> {
		const latestModules = this.#scanner.getLatestVersions(Array.from(this.#installedModules.values()))

		this.#loadedPlugins = []

		for (const module of latestModules) {
			try {
				const loaded = await this.#loadModulePlugin(module)
				if (loaded) {
					this.#loadedPlugins.push(loaded)
				}
			} catch (e) {
				this.#logger.error(`Failed to load module ${module.id}: ${e}`)
			}
		}

		this.emit('modulesLoaded', this.#loadedPlugins)
	}

	/**
	 * Load a single module's plugin code
	 */
	async #loadModulePlugin(module: InstalledModule): Promise<LoadedPlugin | null> {
		// Validate entrypoint exists
		if (!this.#scanner.validateEntrypoint(module)) {
			this.#logger.warn(`Module ${module.id} has invalid entrypoint`)
			return null
		}

		const entrypointPath = this.#scanner.getEntrypointPath(module)

		try {
			// Use file:// URL for ESM import
			const fileUrl = `file://${entrypointPath}`
			const moduleExports = await import(fileUrl)
			const plugin = moduleExports.default as SurfacePlugin<unknown>

			if (!plugin) {
				this.#logger.warn(`Module ${module.id} has no default export`)
				return null
			}

			return {
				info: {
					pluginId: module.manifest.id,
					pluginName: module.manifest.name,
				},
				plugin,
				module,
			}
		} catch (e) {
			this.#logger.error(`Error loading plugin code for ${module.id}: ${e}`)
			return null
		}
	}

	/**
	 * Get all loaded plugins
	 */
	getLoadedPlugins(): LoadedPlugin[] {
		return [...this.#loadedPlugins]
	}

	/**
	 * Get all installed modules
	 */
	getInstalledModules(): InstalledModule[] {
		return Array.from(this.#installedModules.values())
	}

	/**
	 * Get available modules from the store
	 */
	getAvailableModules(): Record<string, ModuleStoreEntry> | null {
		return this.#storeService.getCachedStoreList()
	}

	/**
	 * Check if a module is installed (any version)
	 */
	isModuleInstalled(moduleId: string): boolean {
		for (const mod of this.#installedModules.values()) {
			if (mod.id === moduleId) return true
		}
		return false
	}

	/**
	 * Get installed version of a module
	 */
	getInstalledVersion(moduleId: string): string | null {
		const modules = Array.from(this.#installedModules.values()).filter((m) => m.id === moduleId)
		if (modules.length === 0) return null
		// Return latest installed version
		return this.#scanner.getLatestVersions(modules)[0]?.version ?? null
	}

	/**
	 * Install a module from the store
	 */
	async installModule(
		moduleId: string,
		version: string | null = null,
	): Promise<{ success: boolean; error?: string }> {
		const result = await this.#installer.installFromStore(moduleId, version)

		if (result.success && result.module) {
			const key = `${result.module.id}@${result.module.version}`
			this.#installedModules.set(key, result.module)

			// Load the plugin
			const loaded = await this.#loadModulePlugin(result.module)
			if (loaded) {
				// Check if we're replacing an existing version
				const existingIndex = this.#loadedPlugins.findIndex((p) => p.info.pluginId === moduleId)
				if (existingIndex >= 0) {
					this.#loadedPlugins[existingIndex] = loaded
				} else {
					this.#loadedPlugins.push(loaded)
				}
			}

			this.emit('moduleInstalled', result.module)
		}

		return result
	}

	/**
	 * Uninstall a module
	 */
	async uninstallModule(moduleId: string, version: string): Promise<{ success: boolean; error?: string }> {
		const result = await this.#installer.uninstall(moduleId, version)

		if (result.success) {
			const key = `${moduleId}@${version}`
			this.#installedModules.delete(key)

			// Remove from loaded plugins
			const index = this.#loadedPlugins.findIndex(
				(p) => p.info.pluginId === moduleId && p.module.version === version,
			)
			if (index >= 0) {
				this.#loadedPlugins.splice(index, 1)
			}

			this.emit('moduleUninstalled', moduleId, version)
		}

		return result
	}

	/**
	 * Refresh the store module list
	 */
	async refreshStoreList(): Promise<void> {
		await this.#storeService.refreshStoreList()
	}

	/**
	 * Check for module updates
	 */
	async checkForUpdates(): Promise<ModuleUpdateInfo[]> {
		const updates: ModuleUpdateInfo[] = []
		const storeList = this.#storeService.getCachedStoreList()
		if (!storeList) return updates

		for (const module of this.#scanner.getLatestVersions(Array.from(this.#installedModules.values()))) {
			const versionInfo = await this.#storeService.fetchModuleVersionInfo(module.id, null, true)
			if (versionInfo && versionInfo.id !== module.version) {
				updates.push({
					moduleId: module.id,
					currentVersion: module.version,
					latestVersion: versionInfo.id,
				})
			}
		}

		return updates
	}

	/**
	 * Ensure required modules are installed based on enabled plugins config
	 */
	async ensureModulesForConfig(enabledPlugins: Record<string, boolean>): Promise<void> {
		for (const [pluginId, enabled] of Object.entries(enabledPlugins)) {
			if (!enabled) continue

			if (!this.isModuleInstalled(pluginId)) {
				this.#logger.info(`Installing missing module: ${pluginId}`)
				await this.installModule(pluginId)
			}
		}
	}

	/**
	 * Get the store service for direct access
	 */
	get storeService(): ModuleStoreService {
		return this.#storeService
	}

	/**
	 * Get the installer for direct access
	 */
	get installer(): ModuleInstaller {
		return this.#installer
	}
}
