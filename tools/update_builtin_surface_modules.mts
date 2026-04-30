/* eslint-disable n/no-process-exit */
import fs from 'node:fs/promises'
import path from 'node:path'
import pQueue from 'p-queue'
import pRetry from 'p-retry'
import semver from 'semver'
import { generateUdevFile, type UdevRuleDefinition } from 'udev-generator'
// eslint-disable-next-line n/no-extraneous-import
import basePkg from '@companion-surface/base/package.json' with { type: 'json' }
import { fetchBuiltinSurfaceModules } from './fetch_builtin_modules.mts'

const SURFACE_BASE_VERSION = basePkg.version
const surfaceVersion = semver.parse(SURFACE_BASE_VERSION)
if (!surfaceVersion) throw new Error(`Failed to parse version as semver: ${SURFACE_BASE_VERSION}`)
const validSurfaceApiRange = new semver.Range(
	`${surfaceVersion.major} - ${surfaceVersion.major}.${surfaceVersion.minor}`, // allow patch versions of the same minor
)

const builtinSurfaceModulesPath = path.join(import.meta.dirname, '../assets/builtin-surface-modules.json')

const existingModules = JSON.parse(await fs.readFile(builtinSurfaceModulesPath, 'utf8'))
const oldVersions: Record<string, string> = Object.fromEntries(
	Object.entries(existingModules).map(([id, info]: [string, any]) => [id, info.version]),
)

const baseUrl = process.env.STAGING_MODULE_API
	? 'https://developer-staging.bitfocus.io/api'
	: 'https://developer.bitfocus.io/api'

const userAgent = `Companion Satellite builtin module scraper`

function isSurfaceApiVersionCompatible(version: string): boolean {
	return version === SURFACE_BASE_VERSION || validSurfaceApiRange.test(version)
}

console.log('existing modules:\n', existingModules)

const errors: Error[] = []

const moduleQueue = new pQueue({
	concurrency: 10,
})
for (const moduleId of Object.keys(existingModules)) {
	void moduleQueue.add(async () => {
		await pRetry(
			async () => {
				const res = await fetch(`${baseUrl}/v1/companion/modules/surface/${moduleId}`, {
					signal: AbortSignal.timeout(10000),
					headers: { 'User-Agent': userAgent },
				})
				if (!res.ok) {
					throw new Error(`Error fetching module ${moduleId}: ${res.status} ${res.statusText}`)
				}
				const moduleInfoData: any = await res.json()

				// This assumes the modules are ordered with newest first
				const latestCompatibleVersion =
					moduleInfoData.versions.find(
						// Find latest release version
						(version: any) =>
							isSurfaceApiVersionCompatible(version.apiVersion) &&
							version.tarUrl &&
							version.tarSha &&
							!version.isPrerelease,
					) ||
					moduleInfoData.versions.find(
						// Find latest prerelease version
						(version: any) => isSurfaceApiVersionCompatible(version.apiVersion) && version.tarUrl && version.tarSha,
					)
				if (!latestCompatibleVersion) {
					console.log('No compatible version found for', moduleId)
					return
				}

				existingModules[moduleId] = {
					version: latestCompatibleVersion.id,
					tarUrl: latestCompatibleVersion.tarUrl,
					tarSha: latestCompatibleVersion.tarSha,
				}

				console.log(`Found ${moduleId} (${latestCompatibleVersion.id})`)
			},
			{
				retries: 3,
			},
		).catch((err) => {
			errors.push(new Error(`Failed to fetch ${moduleId}: ${err}`))
		})
	})
}

// Wait for all modules to be processed
await moduleQueue.onIdle()

if (errors.length > 0) {
	console.error('Errors occurred while fetching modules:')
	errors.forEach((err) => console.error(err.message))
	process.exit(1)
}

console.log('All modules processed')

await fs.writeFile(builtinSurfaceModulesPath, JSON.stringify(existingModules, null, '\t') + '\n')

const updatedModules = Object.keys(existingModules).filter((id) => existingModules[id].version !== oldVersions[id])
console.log('Done updating builtin surface modules.', existingModules)
console.log('Updated modules:', updatedModules)

const updatedModulesPath = '/tmp/updated-surface-modules.txt'
await fs.writeFile(updatedModulesPath, updatedModules.join(', '))

// Fetch updated modules and regenerate udev rules
const cacheDir = await fetchBuiltinSurfaceModules()

const udevRules: UdevRuleDefinition[] = []
for (const moduleId of Object.keys(existingModules)) {
	const manifestPath = path.join(cacheDir, moduleId, 'companion', 'manifest.json')
	try {
		const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
		for (const usbId of manifest.usbIds ?? []) {
			udevRules.push({ vendorId: usbId.vendorId, productIds: usbId.productIds })
		}
	} catch {
		console.warn(`Could not read manifest for ${moduleId}, skipping udev rules`)
	}
}

const rulesContent = generateUdevFile(udevRules, { mode: 'headless', userGroup: 'satellite' })
const rulesPath = path.join(import.meta.dirname, '../satellite/assets/linux/50-satellite.rules')
await fs.writeFile(rulesPath, rulesContent)
console.log('Generated udev rules:', rulesPath)
