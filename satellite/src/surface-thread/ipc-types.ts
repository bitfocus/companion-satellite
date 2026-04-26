import type { IpcWrapper } from '../lib/ipc-wrapper.js'
import type {
	HIDDevice,
	LogLevel,
	SurfaceDrawProps,
	OpenDeviceResult,
	SurfaceFirmwareUpdateInfo,
} from '@companion-surface/host'
import type { SomeCompanionInputField, OptionsObject } from '@companion-surface/base'
import type { JsonValue } from 'type-fest'

export type SurfaceIpcWrapper = IpcWrapper<SurfaceModuleToHostEvents, HostToSurfaceModuleEvents>

export interface SurfaceModuleToHostEvents {
	register: (msg: RegisterMessage) => RegisterResponseMessage

	disconnect: (msg: DisconnectMessage) => never

	shouldOpenDiscoveredSurface: (msg: ShouldOpenDeviceMessage) => ShouldOpenDeviceResponseMessage
	notifyOpenedDiscoveredDevice: (msg: NotifyOpenedDeviceMessage) => never
	forgetDiscoveredSurfaces: (msg: ForgetDiscoveredSurfacesMessage) => never

	notifyConnectionsFound: (msg: NotifyConnectionsFoundMessage) => never
	notifyConnectionsForgotten: (msg: NotifyConnectionsForgottenMessage) => never

	'log-message': (msg: LogMessageMessage) => never

	'input-press': (msg: InputPressMessage) => never
	'input-rotate': (msg: InputRotateMessage) => never
	'change-page': (msg: ChangePageMessage) => never
	'pincode-entry': (msg: PincodeEntryMessage) => never
	'set-variable-value': (msg: SetVariableValueMessage) => never
	'firmware-update-info': (msg: FirmwareUpdateInfoMessage) => never
}

export interface InitMessage {
	supportsNonSquareButtons: boolean | undefined
}

export interface HostToSurfaceModuleEvents {
	init: (msg: InitMessage) => void
	destroy: (msg: Record<string, never>) => void

	checkHidDevices: (msg: CheckHidDevicesMessage) => CheckHidDevicesResponseMessage
	openHidDevice: (msg: OpenHidDeviceMessage) => OpenDeviceResponseMessage

	scanDevices: (msg: Record<string, never>) => ScanDevicesResponseMessage
	openScannedDevice: (msg: OpenScannedDeviceMessage) => OpenDeviceResponseMessage

	closeSurface: (msg: CloseSurfaceMessage) => void

	readySurface: (msg: ReadySurfaceMessage) => void
	updateConfig: (msg: UpdateConfigMessage) => void

	setBrightness: (msg: SetBrightnessMessage) => void
	drawControls: (msg: DrawControlMessage) => void
	blankSurface: (msg: BlankSurfaceMessage) => void
	setLocked: (msg: SetLockedMessage) => void
	setOutputVariable: (msg: SetOutputVariableMessage) => void
	showStatus: (msg: ShowStatusMessage) => void

	setupRemoteConnections: (msg: SetupRemoteConnectionsMessage) => void
	stopRemoteConnections: (msg: StopRemoteConnectionsMessage) => void
}

export interface RegisterMessage {
	verificationToken: string

	supportsDetection: boolean
	supportsHid: boolean
	supportsScan: boolean
	supportsOutbound: {
		configFields: SomeCompanionInputField[]
	} | null
}
export type RegisterResponseMessage = Record<string, never>

export interface CheckHidDevicesMessage {
	devices: HIDDevice[]
}
export interface CheckHidDevicesResponseMessage {
	devices: CheckDeviceInfo[]
}

/** Info returned from checkHidDevices and scanDevices */
export interface CheckDeviceInfo {
	devicePath: string
	surfaceId: string
	surfaceIdIsNotUnique: boolean
	description: string
}

export interface ScanDevicesResponseMessage {
	devices: CheckDeviceInfo[]
}

export interface OpenScannedDeviceMessage {
	device: CheckDeviceInfo
	resolvedSurfaceId: string
}

export interface CloseSurfaceMessage {
	surfaceId: string
}

export interface ReadySurfaceMessage {
	surfaceId: string
	initialConfig: Record<string, any>
}
export interface UpdateConfigMessage {
	surfaceId: string
	newConfig: Record<string, any>
}

export interface OpenHidDeviceMessage {
	device: HIDDevice
	resolvedSurfaceId: string
}
export interface OpenDeviceResponseMessage {
	info: HostOpenDeviceResult | null
}

export interface DisconnectMessage {
	surfaceId: string
	reason: string | null
}

export interface ShouldOpenDeviceMessage {
	info: CheckDeviceInfo
}
export interface ShouldOpenDeviceResponseMessage {
	shouldOpen: boolean
	resolvedSurfaceId: string
}
export interface NotifyOpenedDeviceMessage {
	info: HostOpenDeviceResult
}
export interface ForgetDiscoveredSurfacesMessage {
	devicePaths: string[]
}

export interface LogMessageMessage {
	time: number
	source: string | undefined
	level: LogLevel
	message: string
}

export interface InputPressMessage {
	surfaceId: string
	controlId: string
	pressed: boolean
}

export interface InputRotateMessage {
	surfaceId: string
	controlId: string
	delta: number
}

export interface ChangePageMessage {
	surfaceId: string
	forward: boolean
}
export interface PincodeEntryMessage {
	surfaceId: string
	keycode: number
}

export interface SetVariableValueMessage {
	surfaceId: string
	name: string
	value: JsonValue | undefined
}

export interface FirmwareUpdateInfoMessage {
	surfaceId: string
	updateInfo: SurfaceFirmwareUpdateInfo | null
}

export interface SetBrightnessMessage {
	surfaceId: string
	brightness: number
}
export interface DrawControlMessage {
	surfaceId: string
	drawProps: IpcDrawProps[]
}

export interface IpcDrawProps extends Omit<SurfaceDrawProps, 'image'> {
	image?: string // base64-encoded
}

export interface BlankSurfaceMessage {
	surfaceId: string
}

export interface SetLockedMessage {
	surfaceId: string
	locked: boolean
	characterCount: number
}

export interface SetOutputVariableMessage {
	surfaceId: string
	name: string
	value: JsonValue | undefined
}

export interface ShowStatusMessage {
	surfaceId: string
	displayHost: string
	message: string
}

export interface SetupRemoteConnectionsMessage {
	connectionInfos: Array<{ connectionId: string; config: OptionsObject }>
}
export interface StopRemoteConnectionsMessage {
	connectionIds: string[]
}

export interface NotifyConnectionsFoundMessage {
	connectionInfos: unknown[]
}
export interface NotifyConnectionsForgottenMessage {
	connectionIds: string[]
}

export interface HostOpenDeviceResult extends Omit<OpenDeviceResult, 'configFields'> {
	configFields: SomeCompanionInputField[] | null
}
