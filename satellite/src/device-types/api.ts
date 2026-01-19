import type HID from 'node-hid'
import type { PixelFormat } from '@julusian/image-rs'
import type { SatelliteSurfaceLayout } from '../generated/SurfaceManifestSchema.js'
import type { GridSize } from '../surfaceProxy.js'
import type { SurfacePincodeMap } from '@companion-surface/base'

export type HIDDevice = HID.Device

export type SurfaceId = string

export type DeviceDrawImageFn = (width: number, height: number, format: PixelFormat) => Promise<Buffer>

export interface DeviceDrawProps {
	deviceId: string
	/** @deprecated TODO: is this needed? */
	keyIndex: number
	controlId: string
	row: number
	column: number
	image?: DeviceDrawImageFn
	color?: string // hex
	text?: string
}
export interface DeviceRegisterProps {
	brightness: boolean
	surfaceManifest: SatelliteSurfaceLayout
	transferVariables?: Array<DeviceRegisterInputVariable | DeviceRegisterOutputVariable>
	pincodeMap: SurfacePincodeMap | null
}

export interface DeviceRegisterPropsComplete extends Omit<DeviceRegisterProps, 'pincodeMap'> {
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
