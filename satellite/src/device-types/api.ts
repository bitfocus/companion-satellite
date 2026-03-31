import type { SatelliteSurfaceLayout } from '../generated/SurfaceManifestSchema.js'
import type { SatelliteConfigFields } from '../generated/SatelliteConfigFieldsSchema.js'
import type { GridSize } from './lib.js'

export type SurfaceId = string

export interface DeviceRegisterProps {
	serialNumber: string
	serialIsUnique: boolean

	brightness: boolean
	surfaceManifest: SatelliteSurfaceLayout
	transferVariables: Array<DeviceRegisterInputVariable | DeviceRegisterOutputVariable> | undefined
	configFields: SatelliteConfigFields | undefined

	gridSize: GridSize
	fallbackBitmapSize: number
}

export interface DeviceRegisterInputVariable {
	id: string
	type: 'input'
	name: string
	description?: string
}
export interface DeviceRegisterOutputVariable {
	id: string
	type: 'output'
	name: string
	description?: string
}

export interface ClientCapabilities {
	supportsSurfaceManifest: boolean
}
