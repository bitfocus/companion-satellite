/**
 * Types for the module store system
 * Based on the Bitfocus Module Store API
 */

/** Module entry from the store list API */
export interface ModuleStoreEntry {
	id: string
	name: string
	shortname: string
	products: string[]
	keywords: string[]
	storeUrl: string
	githubUrl: string | null
	helpUrl: string | null
	legacyIds: string[]
	deprecationReason: string | null
}

/** Version information for a module */
export interface ModuleVersionInfo {
	/** Version string (e.g., "1.0.3") */
	id: string
	/** Release channel */
	releaseChannel: 'stable' | 'beta'
	/** ISO date string */
	releasedAt: string
	/** Download URL for the tar.gz */
	tarUrl: string | null
	/** SHA256 checksum of the tar.gz */
	tarSha: string | null
	/** API version this module requires */
	apiVersion: string
	/** Help documentation URL */
	helpUrl: string | null
	/** Deprecation reason if deprecated */
	deprecationReason: string | null
}

/** Module info store entry (cached module version info) */
export interface ModuleStoreModuleInfo {
	id: string
	lastUpdated: number
	lastUpdateAttempt: number
	updateWarning: string | null
	versions: ModuleVersionInfo[]
}

/** Cached module list */
export interface ModuleStoreListCache {
	lastUpdated: number
	lastUpdateAttempt: number
	updateWarning: string | null
	/** API version used when fetching the list */
	surfaceModuleApiVersion: string | null
	/** Cached modules keyed by module ID */
	surfaceModules: Record<string, ModuleStoreEntry> | null
}

/** Surface module manifest from companion/manifest.json */
export interface SurfaceModuleManifest {
	type: 'surface'
	id: string
	name: string
	shortname?: string
	version: string
	products: string[]
	keywords?: string[]
	bugs?: string
	repository?: string
	isPrerelease?: boolean
	runtime: {
		type: string
		apiVersion: string
		entrypoint: string
	}
}

/** Information about an installed module */
export interface InstalledModule {
	/** Module ID */
	id: string
	/** Module version */
	version: string
	/** Full path to the module directory */
	path: string
	/** Parsed manifest */
	manifest: SurfaceModuleManifest
	/** Whether this is a pre-release version */
	isBeta: boolean
}

/** Module info exposed via API */
export interface ApiModuleInfo {
	id: string
	name: string
	version: string
	installedVersion: string | null
	updateAvailable: boolean
	latestVersion: string | null
}

/** Result from installing a module */
export interface InstallResult {
	success: boolean
	error?: string
	module?: InstalledModule
}

/** Result from checking for updates */
export interface ModuleUpdateInfo {
	moduleId: string
	currentVersion: string
	latestVersion: string
}
