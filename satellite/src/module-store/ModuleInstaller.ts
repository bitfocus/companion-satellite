import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { promisify } from 'util'
import crypto from 'crypto'
import { createLogger } from '../logging.js'
import type { ModuleStoreService } from './ModuleStoreService.js'
import type { InstallResult, ModuleVersionInfo, SurfaceModuleManifest } from './types.js'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import * as tarfs from 'tar-fs'

const gunzip = promisify(zlib.gunzip)

// Maximum size of a module tar.gz file (20 MB)
const MAX_MODULE_SIZE = 20 * 1024 * 1024

/**
 * Service for downloading and installing surface modules
 */
export class ModuleInstaller {
	readonly #logger = createLogger('ModuleInstaller')
	readonly #modulesDir: string
	readonly #storeService: ModuleStoreService
	readonly #appVersion: string

	#installing = new Set<string>()

	constructor(modulesDir: string, storeService: ModuleStoreService, appVersion: string) {
		this.#modulesDir = modulesDir
		this.#storeService = storeService
		this.#appVersion = appVersion
	}

	/**
	 * Initialize the installer (create modules directory if needed)
	 */
	async init(): Promise<void> {
		if (!fs.existsSync(this.#modulesDir)) {
			fs.mkdirSync(this.#modulesDir, { recursive: true })
			this.#logger.info(`Created modules directory: ${this.#modulesDir}`)
		}

		// Write a README file
		const readmePath = path.join(this.#modulesDir, 'README')
		if (!fs.existsSync(readmePath)) {
			fs.writeFileSync(
				readmePath,
				'This directory contains installed surface modules.\r\nDo not modify unless you know what you are doing.\n',
			)
		}
	}

	/**
	 * Get the path where a module would be installed
	 */
	getModulePath(moduleId: string, version: string): string {
		return path.join(this.#modulesDir, `${moduleId}-${version}`)
	}

	/**
	 * Check if a module is already installed
	 */
	isModuleInstalled(moduleId: string, version: string): boolean {
		const modulePath = this.getModulePath(moduleId, version)
		const manifestPath = path.join(modulePath, 'companion', 'manifest.json')
		return fs.existsSync(manifestPath)
	}

	/**
	 * Install a module from the store
	 */
	async installFromStore(moduleId: string, versionId: string | null = null): Promise<InstallResult> {
		const installKey = `${moduleId}-${versionId ?? 'latest'}`

		if (this.#installing.has(installKey)) {
			return { success: false, error: 'Module is already being installed' }
		}

		this.#installing.add(installKey)

		try {
			// Get version info from the store
			const versionInfo = await this.#storeService.fetchModuleVersionInfo(moduleId, versionId, true)

			if (!versionInfo) {
				return {
					success: false,
					error: `Module ${moduleId} ${versionId ? `v${versionId}` : '(latest)'} not found in store`,
				}
			}

			return await this.#installModuleVersion(moduleId, versionInfo)
		} catch (e) {
			this.#logger.error(`Failed to install ${moduleId}: ${e}`)
			return { success: false, error: `Installation failed: ${e}` }
		} finally {
			this.#installing.delete(installKey)
		}
	}

	/**
	 * Install a specific module version
	 */
	async #installModuleVersion(moduleId: string, versionInfo: ModuleVersionInfo): Promise<InstallResult> {
		const version = versionInfo.id
		const moduleDir = this.getModulePath(moduleId, version)

		// Check if already installed
		if (this.isModuleInstalled(moduleId, version)) {
			this.#logger.debug(`Module ${moduleId} v${version} is already installed`)
			// Return the existing installation
			const manifest = this.#readManifest(moduleDir)
			if (manifest) {
				return {
					success: true,
					module: {
						id: moduleId,
						version,
						path: moduleDir,
						manifest,
						isBeta: versionInfo.releaseChannel === 'beta',
					},
				}
			}
		}

		if (!versionInfo.tarUrl) {
			return { success: false, error: `Module ${moduleId} v${version} has no download URL` }
		}

		if (!versionInfo.tarSha) {
			return { success: false, error: `Module ${moduleId} v${version} has no checksum` }
		}

		this.#logger.info(`Downloading ${moduleId} v${version}...`)

		// Download the tar.gz
		const tarBuffer = await this.#downloadModule(versionInfo.tarUrl)
		if (!tarBuffer) {
			return { success: false, error: 'Download failed' }
		}

		// Verify checksum
		const checksum = crypto.createHash('sha256').update(tarBuffer).digest('hex')
		if (checksum !== versionInfo.tarSha) {
			return { success: false, error: 'Checksum verification failed' }
		}

		// Decompress
		let decompressed: Buffer
		try {
			decompressed = await gunzip(tarBuffer)
		} catch (e) {
			return { success: false, error: `Failed to decompress: ${e}` }
		}

		// Extract manifest first to validate
		const manifest = await this.#extractManifestFromTar(decompressed)
		if (!manifest) {
			return { success: false, error: 'Invalid module: missing manifest' }
		}

		// Validate manifest matches what we expected
		if (manifest.id !== moduleId) {
			return {
				success: false,
				error: `Manifest ID mismatch: expected ${moduleId}, got ${manifest.id}`,
			}
		}

		// Extract to directory
		try {
			await this.#extractTar(decompressed, moduleDir)
		} catch (e) {
			// Clean up on failure
			if (fs.existsSync(moduleDir)) {
				fs.rmSync(moduleDir, { recursive: true, force: true })
			}
			return { success: false, error: `Failed to extract: ${e}` }
		}

		this.#logger.info(`Installed ${moduleId} v${version}`)

		return {
			success: true,
			module: {
				id: moduleId,
				version,
				path: moduleDir,
				manifest,
				isBeta: versionInfo.releaseChannel === 'beta',
			},
		}
	}

	/**
	 * Download a module tar.gz from URL
	 */
	async #downloadModule(url: string): Promise<Buffer | null> {
		try {
			const controller = new AbortController()
			const response = await fetch(url, {
				headers: {
					'User-Agent': `CompanionSatellite/${this.#appVersion}`,
				},
				signal: controller.signal,
			})

			if (!response.ok || !response.body) {
				throw new Error(`HTTP ${response.status}`)
			}

			// Download with size limit
			const chunks: Uint8Array[] = []
			let totalSize = 0

			const reader = response.body.getReader()
			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				totalSize += value.byteLength
				if (totalSize > MAX_MODULE_SIZE) {
					controller.abort()
					throw new Error('Module exceeds maximum size limit')
				}

				chunks.push(value)
			}

			return Buffer.concat(chunks)
		} catch (e) {
			this.#logger.error(`Download failed: ${e}`)
			return null
		}
	}

	/**
	 * Extract manifest from tar buffer without fully extracting
	 */
	async #extractManifestFromTar(tarData: Buffer): Promise<SurfaceModuleManifest | null> {
		// Use tar-fs to extract to a temp location just to get the manifest
		// For simplicity, we'll scan the raw tar for the manifest
		const { extract } = await import('tar-stream')
		const extractor = extract()

		return new Promise((resolve) => {
			let rootDir: string | undefined

			extractor.on('entry', (header, stream, next) => {
				// First entry should help us determine the root directory
				if (rootDir === undefined) {
					rootDir = header.type === 'directory' ? header.name : ''
				}

				const filename =
					rootDir && header.name.startsWith(rootDir) ? header.name.slice(rootDir.length) : header.name

				if (filename === 'companion/manifest.json') {
					const chunks: Buffer[] = []
					stream.on('data', (chunk) => chunks.push(chunk))
					stream.on('end', () => {
						try {
							const content = Buffer.concat(chunks).toString('utf8')
							const manifest = JSON.parse(content) as SurfaceModuleManifest
							resolve(manifest)
							extractor.destroy()
						} catch {
							resolve(null)
						}
						next()
					})
				} else {
					stream.resume()
					stream.on('end', next)
				}
			})

			extractor.on('finish', () => resolve(null))
			extractor.on('error', () => resolve(null))

			Readable.from(tarData).pipe(extractor)
		})
	}

	/**
	 * Extract tar to directory
	 */
	async #extractTar(tarData: Buffer, destDir: string): Promise<void> {
		// Create destination directory
		fs.mkdirSync(destDir, { recursive: true })

		// Extract using tar-fs with strip: 1 to remove the root directory
		await pipeline(Readable.from(tarData), tarfs.extract(destDir, { strip: 1 }))
	}

	/**
	 * Read manifest from an installed module
	 */
	#readManifest(modulePath: string): SurfaceModuleManifest | null {
		try {
			const manifestPath = path.join(modulePath, 'companion', 'manifest.json')
			const content = fs.readFileSync(manifestPath, 'utf8')
			return JSON.parse(content) as SurfaceModuleManifest
		} catch {
			return null
		}
	}

	/**
	 * Uninstall a module
	 */
	async uninstall(moduleId: string, version: string): Promise<{ success: boolean; error?: string }> {
		const modulePath = this.getModulePath(moduleId, version)

		if (!fs.existsSync(modulePath)) {
			return { success: false, error: 'Module not found' }
		}

		try {
			fs.rmSync(modulePath, { recursive: true, force: true })
			this.#logger.info(`Uninstalled ${moduleId} v${version}`)
			return { success: true }
		} catch (e) {
			this.#logger.error(`Failed to uninstall ${moduleId} v${version}: ${e}`)
			return { success: false, error: `Uninstall failed: ${e}` }
		}
	}

	/**
	 * Get the modules directory path
	 */
	get modulesDir(): string {
		return this.#modulesDir
	}
}
