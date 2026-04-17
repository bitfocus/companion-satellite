import * as esbuild from 'esbuild'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Build the surface-thread entrypoint into a self-contained CJS bundle.
 *
 * All npm dependencies are left as external so they are resolved at runtime
 * via the NODE_PATH set by the parent process (satellite). Only the code from
 * this repository is inlined (ipc-wrapper, host-context, ipc-types, etc.).
 *
 * The output uses the `.cjs` extension so Node.js treats it as CommonJS even
 * inside the `satellite/` workspace whose package.json declares `"type":"module"`.
 */
export async function buildSurfaceThreadEntrypoint(): Promise<void> {
	await esbuild.build({
		entryPoints: [join(repoRoot, 'satellite/src/surface-thread/entrypoint.ts')],
		bundle: true,
		platform: 'node',
		target: 'node22',
		format: 'cjs',
		outfile: join(repoRoot, 'satellite/dist/surface-entrypoint.cjs'),
		external: [
			// All node_modules are supplied via NODE_PATH at runtime
			'@companion-surface/*',
			'node-hid',
			'@napi-rs/*',
			'@julusian/*',
			'usb',
		],
		// Keep native require calls intact
		treeShaking: true,
		logLevel: 'info',
	})
}
