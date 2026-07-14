import { describe, it, expect } from 'vitest'
import type { SurfaceSchemaLayoutDefinition } from '@companion-surface/host'
import { stripUnsupportedManifestFeatures, translateModuleToSatelliteSurfaceLayout } from '../translateSchema.js'
import type { SatelliteSurfaceLayout } from '../generated/SurfaceManifestSchema.js'

describe('translateModuleToSatelliteSurfaceLayout', () => {
	it('passes leds config through unchanged', () => {
		const moduleLayout: SurfaceSchemaLayoutDefinition = {
			stylePresets: {
				default: { leds: { segments: 24, mode: 'full-ring' } },
			},
			controls: {
				'0/0': { row: 0, column: 0 },
			},
		}

		const result = translateModuleToSatelliteSurfaceLayout(moduleLayout)

		expect(result.stylePresets.default.leds).toEqual({ segments: 24, mode: 'full-ring' })
	})

	it('leaves leds undefined when the preset does not declare it', () => {
		const moduleLayout: SurfaceSchemaLayoutDefinition = {
			stylePresets: {
				default: { bitmap: { w: 72, h: 72 }, colors: 'hex' },
			},
			controls: {
				'0/0': { row: 0, column: 0 },
			},
		}

		const result = translateModuleToSatelliteSurfaceLayout(moduleLayout)

		expect(result.stylePresets.default.leds).toBeUndefined()
	})
})

describe('stripUnsupportedManifestFeatures', () => {
	const makeManifest = (): SatelliteSurfaceLayout => ({
		stylePresets: {
			default: { bitmap: { w: 72, h: 72 }, colors: 'hex', text: true },
			ring: { leds: { segments: 24, mode: 'full-ring' }, colors: 'rgb' },
		},
		controls: {
			'0/0': { row: 0, column: 0 },
			'0/1': { row: 0, column: 1, stylePreset: 'ring' },
		},
	})

	it('removes leds from every style preset when the host does not support it', () => {
		const manifest = makeManifest()

		const result = stripUnsupportedManifestFeatures(manifest, { supportsLeds: false })

		expect(result.stylePresets.ring.leds).toBeUndefined()
		expect(result.stylePresets.default.leds).toBeUndefined()
		// No `leds` key anywhere in the serialized manifest that Companion would reject
		expect(JSON.stringify(result)).not.toContain('leds')

		// Other properties and controls are untouched
		expect(result.stylePresets.default).toMatchObject({ bitmap: { w: 72, h: 72 }, colors: 'hex', text: true })
		expect(result.stylePresets.ring.colors).toBe('rgb')
		expect(result.controls).toEqual(manifest.controls)
	})

	it('preserves leds when the host supports it', () => {
		const manifest = makeManifest()

		const result = stripUnsupportedManifestFeatures(manifest, { supportsLeds: true })

		expect(result.stylePresets.ring.leds).toEqual({ segments: 24, mode: 'full-ring' })
	})

	it('does not mutate the input manifest', () => {
		const manifest = makeManifest()

		stripUnsupportedManifestFeatures(manifest, { supportsLeds: false })

		expect(manifest.stylePresets.ring.leds).toEqual({ segments: 24, mode: 'full-ring' })
	})
})
