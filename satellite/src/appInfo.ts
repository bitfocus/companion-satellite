import { createRequire } from 'module'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'

/**
 * How satellite is being run:
 * - electron: the desktop app with a tray icon
 * - installer: headless, installed with pi-image/install.sh (including the SatellitePi image)
 * - headless: headless, run some other way
 */
export type AppDistribution = 'electron' | 'installer' | 'headless'

export interface AppInfo {
	/** The core version, eg 3.7.0 */
	version: string
	/** The full version of the build, eg 3.7.0 or 3.7.0-1234+abcdef0 */
	build: string
	/** Whether this is a build produced by CI, rather than run from source */
	isOfficialBuild: boolean
	distribution: AppDistribution
}

export function getAppInfo(isElectron: boolean): AppInfo {
	const require = createRequire(import.meta.url)
	const pkgJson: { version: string; updateChannel?: string } = require('../package.json')

	const build = pkgJson.version
	const coreVersion = build.match(/^\d+\.\d+\.\d+/)?.[0] ?? build

	let distribution: AppDistribution = isElectron ? 'electron' : 'headless'
	// The installer writes the selected build alongside the app
	if (!isElectron && existsSync(fileURLToPath(new URL('../../BUILD', import.meta.url)))) {
		distribution = 'installer'
	}

	return {
		version: coreVersion,
		build,
		// The update channel is only injected into the package.json by CI builds
		isOfficialBuild: !!pkgJson.updateChannel,
		distribution,
	}
}
