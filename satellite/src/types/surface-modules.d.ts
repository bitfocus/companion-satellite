// Type declarations for surface modules loaded via #modules/* path aliases

declare module '#modules/*/plugin' {
	import type { SurfacePlugin } from '@companion-surface/base'
	const plugin: SurfacePlugin<unknown>
	export default plugin
}

declare module '#modules/*/manifest' {
	const manifest: {
		id: string
		name: string
		shortname: string
		runtime: {
			type: string
			apiVersion: string
			entrypoint: string
		}
	}
	export default manifest
}
