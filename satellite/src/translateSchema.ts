import type { SurfaceSchemaLayoutDefinition } from '@companion-surface/host'
import type {
	SatelliteControlDefinition,
	SatelliteControlStylePreset,
	SatelliteSurfaceLayout,
} from './generated/SurfaceManifestSchema.js'
import { Complete } from './lib.js'
import { SurfaceInputVariable, SurfaceOutputVariable } from '@companion-surface/base'
import { DeviceRegisterInputVariable, DeviceRegisterOutputVariable } from './device-types/api.js'

export function translateModuleToSatelliteSurfaceLayout(
	moduleLayout: SurfaceSchemaLayoutDefinition,
): SatelliteSurfaceLayout {
	const translatedLayout: SatelliteSurfaceLayout = {
		stylePresets: {
			default: {},
		},
		controls: {},
	}

	for (const [presetId, preset] of Object.entries(moduleLayout.stylePresets)) {
		translatedLayout.stylePresets[presetId] = {
			bitmap: preset.bitmap ? { w: preset.bitmap.w, h: preset.bitmap.h } : undefined,
			text: preset.text,
			textStyle: preset.textStyle,
			colors: preset.colors,
		} satisfies Complete<SatelliteControlStylePreset>
	}

	for (const [controlId, control] of Object.entries(moduleLayout.controls)) {
		translatedLayout.controls[controlId] = {
			row: control.row,
			column: control.column,
			stylePreset: control.stylePreset,
		} satisfies Complete<SatelliteControlDefinition>
	}

	return translatedLayout
}

export function translateModuleToSatelliteTransferVariables(
	variables: Array<SurfaceInputVariable | SurfaceOutputVariable> | null,
): Array<DeviceRegisterInputVariable | DeviceRegisterOutputVariable> | undefined {
	if (!variables) return undefined

	return variables.map((variable) => {
		if (variable.type === 'input') {
			return {
				id: variable.id,
				type: 'input',
				name: variable.name,
				description: variable.description,
			} satisfies Complete<DeviceRegisterInputVariable>
		} else {
			return {
				id: variable.id,
				type: 'output',
				name: variable.name,
				description: variable.description,
			} satisfies Complete<DeviceRegisterOutputVariable>
		}
	})
}
