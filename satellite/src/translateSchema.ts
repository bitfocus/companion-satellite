import type {
	SurfaceSchemaLayoutDefinition,
	GridSize,
	SurfaceInputVariable,
	SurfaceOutputVariable,
	SomeCompanionInputField,
} from '@companion-surface/host'
import type {
	SatelliteControlDefinition,
	SatelliteControlStylePreset,
	SatelliteSurfaceLayout,
} from './generated/SurfaceManifestSchema.js'
import type {
	CheckboxField,
	ConfigField,
	DropdownChoice,
	DropdownField,
	NumberField,
	SatelliteConfigFields,
	StaticTextField,
	TextInputField,
} from './generated/SatelliteConfigFieldsSchema.js'
import { Complete } from './lib.js'
import type { DeviceRegisterInputVariable, DeviceRegisterOutputVariable } from './client/client.js'

export function calculateGridSize(surfaceLayout: SurfaceSchemaLayoutDefinition): GridSize {
	return Object.values(surfaceLayout.controls).reduce(
		(gridSize, control): GridSize => ({
			columns: Math.max(gridSize.columns, control.column + 1),
			rows: Math.max(gridSize.rows, control.row + 1),
		}),
		{ columns: 0, rows: 0 },
	)
}

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

export function translateModuleToSatelliteConfigFields(
	fields: SomeCompanionInputField[] | null,
): SatelliteConfigFields | undefined {
	if (!fields || fields.length === 0) return undefined

	return fields.map((field): ConfigField => {
		const common = {
			id: field.id,
			label: field.label,
			description: field.description,
			tooltip: field.tooltip,
			isVisibleExpression: field.isVisibleExpression,
		}
		switch (field.type) {
			case 'static-text':
				return {
					...common,
					type: 'static-text',
					value: field.value,
				} satisfies Complete<StaticTextField>
			case 'textinput':
				return {
					...common,
					type: 'textinput',
					default: field.default,
					regex: field.regex,
					multiline: undefined,
				} satisfies Complete<TextInputField>
			case 'dropdown': {
				const choices: DropdownChoice[] = field.choices.map((c) => ({ id: c.id, label: c.label }))
				return {
					...common,
					type: 'dropdown',
					choices: choices as [DropdownChoice, ...DropdownChoice[]],
					default: field.default,
					allowCustom: undefined,
				} satisfies Complete<DropdownField>
			}
			case 'number':
				return {
					...common,
					type: 'number',
					min: field.min,
					max: field.max,
					default: field.default,
					step: field.step,
				} satisfies Complete<NumberField>
			case 'checkbox':
				return {
					...common,
					type: 'checkbox',
					default: field.default,
				} satisfies Complete<CheckboxField>
		}
	})
}
