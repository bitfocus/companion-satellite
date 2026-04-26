import fs from 'node:fs/promises'
import { SemVer } from 'semver'
import path from 'node:path'

const nodejsVersionsPath = path.join(import.meta.dirname, '../assets/nodejs-versions.json')

const existingVersionsStr = await fs.readFile(nodejsVersionsPath, 'utf8')
const existingVersions = JSON.parse(existingVersionsStr)

console.log('existing bundled versions:', existingVersions)

const apiReleases = await fetch('https://nodejs.org/download/release/index.json').then((res) => res.json())
console.log(`Found ${apiReleases.length} nodejs releases!`)

// Update bundled node runtimes in nodejs-versions.json
const newVersions = { ...existingVersions }

for (const [versionName, currentVersion] of Object.entries(existingVersions)) {
	if (!versionName.startsWith('node')) continue

	let latestVersion = new SemVer(currentVersion)
	for (const apiRelease of apiReleases) {
		const apiSemver = new SemVer(apiRelease.version)
		if (apiSemver.prerelease.length > 0) continue
		if (apiSemver.major === latestVersion.major && apiSemver.compare(latestVersion) > 0) {
			latestVersion = apiSemver
		}
	}

	console.log(`Latest bundled version for ${versionName}: ${latestVersion}`)
	newVersions[versionName] = latestVersion.version
}

await fs.writeFile(nodejsVersionsPath, JSON.stringify(newVersions, null, '\t') + '\n')

// Update the .node-version file (main process node, may differ from bundled runtimes)
const nodeVersionFilePath = path.join(import.meta.dirname, '../.node-version')
const existingNodeVersion = await fs.readFile(nodeVersionFilePath, 'utf8')
const existingNodeMajor = Number(existingNodeVersion.trim().split('.')[0])
if (isNaN(existingNodeMajor)) throw new Error(`Invalid node version in .node-version: ${existingNodeVersion}`)

let latestMainVersion = new SemVer(existingNodeVersion.trim())
for (const apiRelease of apiReleases) {
	const apiSemver = new SemVer(apiRelease.version)
	if (apiSemver.major === existingNodeMajor && apiSemver.compare(latestMainVersion) > 0) {
		latestMainVersion = apiSemver
	}
}
console.log(`Latest main process version for node${existingNodeMajor}: ${latestMainVersion}`)

await fs.writeFile(nodeVersionFilePath, latestMainVersion.version + '\n')

// Update the engines in any package.json files

// async function updatePackageJsonEngines(packageJsonPath) {
// 	const packageJsonStr = await fs.readFile(packageJsonPath, 'utf8')
// 	const packageJson = JSON.parse(packageJsonStr)

// 	if (!packageJson.engines || !packageJson.engines.node) return // Nothing to update

// 	packageJson.engines.node = `^${latestMainVersion.version}`
// 	await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n')
// 	console.log(`Updated engines.node in ${packageJsonPath} to ^${latestMainVersion.version}`)
// }

// await updatePackageJsonEngines(path.join(import.meta.dirname, '../package.json'))
// await updatePackageJsonEngines(path.join(import.meta.dirname, '../satellite/package.json'))
