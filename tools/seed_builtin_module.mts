/* eslint-disable n/no-process-exit */
import { fs, path } from 'zx'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'
import { gunzip } from 'zlib'
import * as tarfs from 'tar-fs'

const gunzipP = promisify(gunzip)

/**
 * Seed the local builtin-surfaces dev cache with a locally-built module tgz.
 *
 * Usage:
 *   yarn dev:seed-surface <path-to-module.tgz> [moduleId]
 *
 * The tgz is extracted (npm-pack style, top-level dir stripped) into
 * `.cache/builtin-surfaces/<id>/`, matching the layout produced by
 * `fetch_builtin_modules.mts`. The folder name defaults to the `id` from the
 * module's `companion/manifest.json`, so seeding a module with the same id as a
 * builtin one replaces it. Pass an explicit `moduleId` to override the folder.
 *
 * Note: the satellite only falls back to this cache when the production
 * `modules/` directory does not exist (i.e. during `yarn dev`).
 */

const tgzPathArg = process.argv[2]
const moduleIdArg = process.argv[3]

if (!tgzPathArg) {
	console.error('Usage: yarn dev:seed-surface <path-to-module.tgz> [moduleId]')
	process.exit(1)
}

const tgzPath = path.resolve(tgzPathArg)
if (!(await fs.pathExists(tgzPath))) {
	console.error(`File not found: ${tgzPath}`)
	process.exit(1)
}

const cacheRoot = path.join(import.meta.dirname, '../.cache')
const cacheDir = path.join(cacheRoot, 'builtin-surfaces')
await fs.mkdirp(cacheDir)

// Decompress: support gzipped (.tgz/.tar.gz) and plain .tar
const rawBuffer = await fs.readFile(tgzPath)
let tarBuffer: Buffer
try {
	tarBuffer = await gunzipP(rawBuffer)
} catch {
	// Not gzipped, assume it is already a plain tar
	tarBuffer = rawBuffer
}

// Extract to a temp dir first so we can read the manifest id
const tmpDir = path.join(cacheRoot, `.seed-tmp-${path.basename(tgzPath)}`)
await fs.remove(tmpDir).catch(() => null)
await fs.mkdirp(tmpDir)

await new Promise<void>((resolve, reject) => {
	Readable.from(tarBuffer)
		.pipe(tarfs.extract(tmpDir, { strip: 1 }))
		.on('finish', () => resolve())
		.on('error', reject)
})

// Determine the target folder name from the manifest id (unless overridden)
let moduleId = moduleIdArg
if (!moduleId) {
	const manifestPath = path.join(tmpDir, 'companion', 'manifest.json')
	if (!(await fs.pathExists(manifestPath))) {
		await fs.remove(tmpDir).catch(() => null)
		console.error(
			`No companion/manifest.json found in the tgz. Pass an explicit moduleId, or check the tgz is a surface module.`,
		)
		process.exit(1)
	}
	const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
	moduleId = manifest.id
	console.log(`Read module id "${moduleId}" (${manifest.version}) from manifest`)
}

const moduleDir = path.join(cacheDir, moduleId)
await fs.remove(moduleDir).catch(() => null)
await fs.move(tmpDir, moduleDir, { overwrite: true })

console.log(`Seeded ${moduleId} into ${path.relative(process.cwd(), moduleDir)}`)
console.log(`Run \`yarn dev\` to load it.`)
