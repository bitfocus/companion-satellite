/* eslint-disable n/no-process-exit */
import fs from 'node:fs/promises'
import path from 'node:path'
import pQueue from 'p-queue'
import pRetry from 'p-retry'
import semver from 'semver'
import basePkg from '@companion-surface/base/package.json' with { type: 'json' }

const SURFACE_BASE_VERSION = basePkg.version
const surfaceVersion = semver.parse(SURFACE_BASE_VERSION)
if (!surfaceVersion) throw new Error(`Failed to parse version as semver: ${SURFACE_BASE_VERSION}`)
const validSurfaceApiRange = new semver.Range(
	`${surfaceVersion.major} - ${surfaceVersion.major}.${surfaceVersion.minor}`, // allow patch versions of the same minor
)

const builtinSurfaceModulesPath = path.join(import.meta.dirname, '../assets/builtin-surface-modules.json')

const existingModules = JSON.parse(await fs.readFile(builtinSurfaceModulesPath, 'utf8'))

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
				const moduleInfoData = await res.json()

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

console.log('Done updating builtin surface modules.', existingModules)
