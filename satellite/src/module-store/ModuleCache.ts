import fs from 'fs'
import path from 'path'
import { createLogger } from '../logging.js'
import type { ModuleStoreListCache, ModuleStoreModuleInfo } from './types.js'

const CACHE_FILE_NAME = 'module-store-cache.json'

interface CacheData {
	storeList: ModuleStoreListCache | null
	moduleInfo: Record<string, ModuleStoreModuleInfo>
}

/**
 * Persistent cache for module store API responses
 * Stores data in a JSON file in the config directory
 */
export class ModuleCache {
	readonly #logger = createLogger('ModuleCache')
	readonly #cachePath: string
	#cache: CacheData

	constructor(configDir: string) {
		this.#cachePath = path.join(configDir, CACHE_FILE_NAME)
		this.#cache = {
			storeList: null,
			moduleInfo: {},
		}

		this.#loadFromDisk()
	}

	#loadFromDisk(): void {
		try {
			if (fs.existsSync(this.#cachePath)) {
				const data = fs.readFileSync(this.#cachePath, 'utf8')
				this.#cache = JSON.parse(data)
				this.#logger.debug('Loaded cache from disk')
			}
		} catch (e) {
			this.#logger.warn(`Failed to load cache from disk: ${e}`)
			this.#cache = {
				storeList: null,
				moduleInfo: {},
			}
		}
	}

	#saveToDisk(): void {
		try {
			const dir = path.dirname(this.#cachePath)
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true })
			}
			fs.writeFileSync(this.#cachePath, JSON.stringify(this.#cache, null, 2))
			this.#logger.debug('Saved cache to disk')
		} catch (e) {
			this.#logger.warn(`Failed to save cache to disk: ${e}`)
		}
	}

	getStoreList(): ModuleStoreListCache | null {
		return this.#cache.storeList
	}

	setStoreList(list: ModuleStoreListCache): void {
		this.#cache.storeList = list
		this.#saveToDisk()
	}

	getModuleInfo(moduleId: string): ModuleStoreModuleInfo | null {
		return this.#cache.moduleInfo[moduleId] ?? null
	}

	setModuleInfo(moduleId: string, info: ModuleStoreModuleInfo): void {
		this.#cache.moduleInfo[moduleId] = info
		this.#saveToDisk()
	}

	/**
	 * Check if the store list cache is still valid
	 * @param maxAgeMs Maximum age in milliseconds (default 6 hours)
	 */
	isStoreListValid(maxAgeMs = 6 * 60 * 60 * 1000): boolean {
		const list = this.#cache.storeList
		if (!list) return false
		return Date.now() - list.lastUpdated < maxAgeMs
	}

	/**
	 * Check if the module info cache is still valid
	 * @param moduleId Module ID to check
	 * @param maxAgeMs Maximum age in milliseconds (default 6 hours)
	 */
	isModuleInfoValid(moduleId: string, maxAgeMs = 6 * 60 * 60 * 1000): boolean {
		const info = this.#cache.moduleInfo[moduleId]
		if (!info) return false
		return Date.now() - info.lastUpdated < maxAgeMs
	}

	/**
	 * Clear all cached data
	 */
	clear(): void {
		this.#cache = {
			storeList: null,
			moduleInfo: {},
		}
		this.#saveToDisk()
	}
}
