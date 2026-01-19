import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { $ } from 'zx'

const modulesDir = fileURLToPath(new URL('../modules', import.meta.url))

// Set verbose mode for zx
$.verbose = true

interface ModuleInfo {
	name: string
	path: string
	manifestPath: string
}

async function getModules(): Promise<ModuleInfo[]> {
	const modules: ModuleInfo[] = []

	if (!fs.existsSync(modulesDir)) {
		console.log('No modules directory found')
		return modules
	}

	const entries = fs.readdirSync(modulesDir, { withFileTypes: true })

	for (const entry of entries) {
		if (!entry.isDirectory()) continue
		if (!entry.name.startsWith('companion-surface-')) continue

		const modulePath = path.join(modulesDir, entry.name)
		const manifestPath = path.join(modulePath, 'companion', 'manifest.json')

		if (!fs.existsSync(manifestPath)) {
			console.log(`Skipping ${entry.name}: no manifest.json found`)
			continue
		}

		modules.push({
			name: entry.name,
			path: modulePath,
			manifestPath,
		})
	}

	return modules
}

async function buildModule(module: ModuleInfo): Promise<boolean> {
	console.log(`\n========================================`)
	console.log(`Building: ${module.name}`)
	console.log(`========================================\n`)

	try {
		// Install dependencies
		console.log(`Installing dependencies for ${module.name}...`)
		await $({ cwd: module.path })`yarn install`

		// Build the module
		console.log(`Building ${module.name}...`)
		await $({ cwd: module.path })`yarn build`

		console.log(`Successfully built: ${module.name}`)
		return true
	} catch (error) {
		console.error(`Failed to build ${module.name}:`, error)
		return false
	}
}

async function main() {
	console.log('Building surface modules...\n')

	const modules = await getModules()

	if (modules.length === 0) {
		console.log('No modules found to build')
		return
	}

	console.log(`Found ${modules.length} modules to build:`)
	for (const module of modules) {
		console.log(`  - ${module.name}`)
	}

	const results: { name: string; success: boolean }[] = []

	for (const module of modules) {
		const success = await buildModule(module)
		results.push({ name: module.name, success })
	}

	console.log('\n========================================')
	console.log('Build Summary')
	console.log('========================================')

	const successful = results.filter((r) => r.success)
	const failed = results.filter((r) => !r.success)

	console.log(`\nSuccessful: ${successful.length}`)
	for (const r of successful) {
		console.log(`  ✓ ${r.name}`)
	}

	if (failed.length > 0) {
		console.log(`\nFailed: ${failed.length}`)
		for (const r of failed) {
			console.log(`  ✗ ${r.name}`)
		}
		process.exit(1)
	}

	console.log('\nAll modules built successfully!')
}

main().catch((error) => {
	console.error('Build failed:', error)
	process.exit(1)
})
