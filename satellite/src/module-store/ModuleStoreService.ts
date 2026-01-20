import { EventEmitter } from 'events'
import { createLogger } from '../logging.js'
import { ModuleCache } from './ModuleCache.js'
import type { ModuleStoreEntry, ModuleStoreListCache, ModuleStoreModuleInfo, ModuleVersionInfo } from './types.js'
import * as semver from 'semver'

const BASE_URL = process.env.STAGING_MODULE_API
	? 'https://developer-staging.bitfocus.io/api'
	: 'https://developer.bitfocus.io/api'

// The API version we support for surface modules
const SURFACE_MODULE_API_VERSION = '1.1.0'

// Cache TTL in milliseconds (6 hours)
const CACHE_TTL = 6 * 60 * 60 * 1000

export type ModuleStoreServiceEvents = {
	storeListUpdated: [data: ModuleStoreListCache]
	moduleInfoUpdated: [moduleId: string, data: ModuleStoreModuleInfo]
	refreshProgress: [percent: number]
}

interface ApiModuleListResponse {
	modules: Array<{
		id: string
		name: string
		shortname: string
		manufacturer?: string
		products: string[]
		keywords: string[]
		storeUrl: string
		githubUrl?: string
		latestHelpUrl?: string
		legacyIds?: string[]
		deprecationReason?: string
	}>
}

interface ApiModuleVersionsResponse {
	versions: Array<{
		id: string
		isPrerelease: boolean
		releasedAt: string
		tarUrl?: string
		tarSha?: string
		apiVersion: string
		helpUrl?: string
		deprecationReason?: string
	}>
}

/**
 * Service for fetching module metadata from the Bitfocus Module Store API
 */
export class ModuleStoreService extends EventEmitter<ModuleStoreServiceEvents> {
	readonly #logger = createLogger('ModuleStoreService')
	readonly #cache: ModuleCache
	readonly #appVersion: string

	#isRefreshingList = false
	#isRefreshingModuleInfo = new Map<string, Promise<ModuleStoreModuleInfo | null>>()

	constructor(cache: ModuleCache, appVersion: string) {
		super()
		this.setMaxListeners(0)

		this.#cache = cache
		this.#appVersion = appVersion
	}

	/**
	 * Get the cached store list
	 */
	getCachedStoreList(): Record<string, ModuleStoreEntry> | null {
		const list = this.#cache.getStoreList()
		return list?.surfaceModules ?? null
	}

	/**
	 * Get cached module version info
	 */
	getCachedModuleVersionInfo(moduleId: string, versionId: string): ModuleVersionInfo | null {
		const moduleInfo = this.#cache.getModuleInfo(moduleId)
		if (!moduleInfo) return null
		return moduleInfo.versions.find((v) => v.id === versionId) ?? null
	}

	/**
	 * Fetch module version info, refreshing from API if cache is stale
	 */
	async fetchModuleVersionInfo(
		moduleId: string,
		versionId: string | null,
		onlyCompatible: boolean,
	): Promise<ModuleVersionInfo | null> {
		let moduleInfo = this.#cache.getModuleInfo(moduleId)

		// Refresh if not cached or stale
		if (!moduleInfo || !this.#cache.isModuleInfoValid(moduleId, CACHE_TTL)) {
			moduleInfo = await this.#refreshModuleInfo(moduleId)
			if (!moduleInfo) return null
		}

		if (versionId) {
			return moduleInfo.versions.find((v) => v.id === versionId) ?? null
		} else {
			return this.#getLatestVersion(moduleInfo.versions, onlyCompatible)
		}
	}

	/**
	 * Get the latest compatible version from a list of versions
	 */
	#getLatestVersion(versions: ModuleVersionInfo[], onlyCompatible: boolean): ModuleVersionInfo | null {
		return versions.reduce<ModuleVersionInfo | null>((latest, version) => {
			if (!version.tarUrl) return latest
			if (version.deprecationReason) return latest
			if (onlyCompatible && !this.#isApiVersionCompatible(version.apiVersion)) return latest
			if (!latest) return version
			if (semver.gt(version.id, latest.id)) return version
			return latest
		}, null)
	}

	/**
	 * Check if an API version is compatible with what we support
	 */
	#isApiVersionCompatible(apiVersion: string): boolean {
		// We're compatible if the module's API version is <= our supported version
		// and they share the same major version
		try {
			const parsed = semver.parse(apiVersion)
			const supported = semver.parse(SURFACE_MODULE_API_VERSION)
			if (!parsed || !supported) return false
			return parsed.major === supported.major && semver.lte(apiVersion, SURFACE_MODULE_API_VERSION)
		} catch {
			return false
		}
	}

	/**
	 * Refresh the store module list from the API
	 */
	async refreshStoreList(): Promise<void> {
		if (this.#isRefreshingList) {
			this.#logger.debug('Skipping refresh, already in progress')
			return
		}

		this.#isRefreshingList = true
		this.#logger.debug('Refreshing store module list')

		try {
			this.emit('refreshProgress', 0)

			const url = new URL(`${BASE_URL}/v1/companion/modules/surface`)
			url.searchParams.set('module-api-version', SURFACE_MODULE_API_VERSION)

			const response = await fetch(url.toString(), {
				headers: {
					'User-Agent': `CompanionSatellite/${this.#appVersion}`,
				},
			})

			this.emit('refreshProgress', 0.5)

			if (!response.ok) {
				throw new Error(`API request failed: ${response.status} ${response.statusText}`)
			}

			const data = (await response.json()) as ApiModuleListResponse

			const surfaceModules: Record<string, ModuleStoreEntry> = {}
			for (const mod of data.modules) {
				let products = mod.products
				if (mod.manufacturer) {
					products = products.map((p) => `${mod.manufacturer}: ${p}`)
				}
				if (products.length === 0) {
					products = [mod.manufacturer ?? mod.name]
				}

				surfaceModules[mod.id] = {
					id: mod.id,
					name: products.join('; '),
					shortname: mod.shortname,
					products,
					keywords: mod.keywords,
					storeUrl: mod.storeUrl,
					githubUrl: mod.githubUrl ?? null,
					helpUrl: mod.latestHelpUrl ?? null,
					legacyIds: mod.legacyIds ?? [],
					deprecationReason: mod.deprecationReason ?? null,
				}
			}

			const cacheEntry: ModuleStoreListCache = {
				lastUpdated: Date.now(),
				lastUpdateAttempt: Date.now(),
				updateWarning: null,
				surfaceModuleApiVersion: SURFACE_MODULE_API_VERSION,
				surfaceModules,
			}

			this.#cache.setStoreList(cacheEntry)
			this.emit('storeListUpdated', cacheEntry)
			this.emit('refreshProgress', 1)

			this.#logger.info(`Refreshed store list: ${Object.keys(surfaceModules).length} modules`)
		} catch (e) {
			this.#logger.warn(`Failed to refresh store list: ${e}`)

			// Update the cache to mark the attempt
			const existing = this.#cache.getStoreList()
			if (existing) {
				existing.lastUpdateAttempt = Date.now()
				existing.updateWarning = 'Failed to update the module list from the store'
				this.#cache.setStoreList(existing)
			}
		} finally {
			this.#isRefreshingList = false
		}
	}

	/**
	 * Refresh module info from the API
	 */
	async #refreshModuleInfo(moduleId: string): Promise<ModuleStoreModuleInfo | null> {
		// Check if already refreshing
		const existing = this.#isRefreshingModuleInfo.get(moduleId)
		if (existing) {
			return existing
		}

		const promise = this.#doRefreshModuleInfo(moduleId)
		this.#isRefreshingModuleInfo.set(moduleId, promise)

		try {
			return await promise
		} finally {
			this.#isRefreshingModuleInfo.delete(moduleId)
		}
	}

	async #doRefreshModuleInfo(moduleId: string): Promise<ModuleStoreModuleInfo | null> {
		this.#logger.debug(`Refreshing info for module "${moduleId}"`)

		try {
			const url = `${BASE_URL}/v1/companion/modules/surface/${moduleId}`
			const response = await fetch(url, {
				headers: {
					'User-Agent': `CompanionSatellite/${this.#appVersion}`,
				},
			})

			if (response.status === 404) {
				// Module not found in store
				const info: ModuleStoreModuleInfo = {
					id: moduleId,
					lastUpdated: Date.now(),
					lastUpdateAttempt: Date.now(),
					updateWarning: null,
					versions: [],
				}
				this.#cache.setModuleInfo(moduleId, info)
				return info
			}

			if (!response.ok) {
				throw new Error(`API request failed: ${response.status} ${response.statusText}`)
			}

			const data = (await response.json()) as ApiModuleVersionsResponse

			const versions: ModuleVersionInfo[] = data.versions.map((v) => ({
				id: v.id.startsWith('v') ? v.id.slice(1) : v.id,
				releaseChannel: v.isPrerelease ? 'beta' : 'stable',
				releasedAt: v.releasedAt,
				tarUrl: v.tarUrl ?? null,
				tarSha: v.tarSha ?? null,
				apiVersion: v.apiVersion,
				helpUrl: v.helpUrl ?? null,
				deprecationReason: v.deprecationReason ?? null,
			}))

			const info: ModuleStoreModuleInfo = {
				id: moduleId,
				lastUpdated: Date.now(),
				lastUpdateAttempt: Date.now(),
				updateWarning: null,
				versions,
			}

			this.#cache.setModuleInfo(moduleId, info)
			this.emit('moduleInfoUpdated', moduleId, info)

			this.#logger.debug(`Refreshed info for module "${moduleId}": ${versions.length} versions`)
			return info
		} catch (e) {
			this.#logger.warn(`Failed to refresh info for module "${moduleId}": ${e}`)

			// Return existing cache if available
			const cached = this.#cache.getModuleInfo(moduleId)
			if (cached) {
				cached.lastUpdateAttempt = Date.now()
				cached.updateWarning = 'Failed to update module info from the store'
				this.#cache.setModuleInfo(moduleId, cached)
				return cached
			}

			return null
		}
	}

	/**
	 * Ensure store list is loaded, refreshing if necessary
	 */
	async ensureStoreListLoaded(): Promise<void> {
		if (!this.#cache.isStoreListValid(CACHE_TTL)) {
			await this.refreshStoreList()
		}
	}

	/**
	 * Trigger a background refresh of the store list
	 */
	triggerStoreListRefresh(): void {
		this.refreshStoreList().catch((e) => {
			this.#logger.error(`Background refresh failed: ${e}`)
		})
	}
}
