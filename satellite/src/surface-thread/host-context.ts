import type {
	CheckDeviceResult,
	HostCapabilities,
	HostSurfaceEvents,
	OpenDeviceResult,
	SurfaceHostContext,
	SurfaceFirmwareUpdateInfo,
	ShouldOpenSurfaceResult,
} from '@companion-surface/host'
import type { SurfaceIpcWrapper } from './ipc-types.js'
import { LockingGraphicsGeneratorImpl } from '../graphics/locking.js'
import { CardGenerator } from '../graphics/cards.js'
import type { JsonValue } from 'type-fest'

export class HostContext implements SurfaceHostContext {
	readonly #ipcWrapper: SurfaceIpcWrapper

	readonly lockingGraphics = new LockingGraphicsGeneratorImpl()
	readonly cardsGenerator = new CardGenerator()

	readonly capabilities: HostCapabilities = { supportsNonSquareButtons: undefined }

	readonly surfaceEvents: HostSurfaceEvents

	constructor(ipcWrapper: SurfaceIpcWrapper) {
		this.#ipcWrapper = ipcWrapper

		this.surfaceEvents = {
			disconnected: (surfaceId: string) => {
				this.#ipcWrapper.sendWithNoCb('disconnect', { surfaceId, reason: null })
			},
			inputPress: (surfaceId: string, controlId: string, pressed: boolean) => {
				this.#ipcWrapper.sendWithNoCb('input-press', { surfaceId, controlId, pressed })
			},
			inputRotate: (surfaceId: string, controlId: string, delta: number) => {
				this.#ipcWrapper.sendWithNoCb('input-rotate', { surfaceId, controlId, delta })
			},
			changePage: (surfaceId: string, forward: boolean) => {
				this.#ipcWrapper.sendWithNoCb('change-page', { surfaceId, forward })
			},
			setVariableValue: (surfaceId: string, name: string, value: JsonValue) => {
				this.#ipcWrapper.sendWithNoCb('set-variable-value', { surfaceId, name, value })
			},
			pincodeEntry: (surfaceId: string, char: number) => {
				this.#ipcWrapper.sendWithNoCb('pincode-entry', { surfaceId, keycode: char })
			},
			firmwareUpdateInfo: (surfaceId: string, updateInfo: SurfaceFirmwareUpdateInfo | null) => {
				this.#ipcWrapper.sendWithNoCb('firmware-update-info', { surfaceId, updateInfo })
			},
		}
	}

	readonly shouldOpenDiscoveredSurface = async (info: CheckDeviceResult): Promise<ShouldOpenSurfaceResult> => {
		const result = await this.#ipcWrapper.sendWithCb('shouldOpenDiscoveredSurface', {
			info: {
				devicePath: info.devicePath,
				surfaceId: info.surfaceId,
				surfaceIdIsNotUnique: info.surfaceIdIsNotUnique,
				description: info.description,
			},
		})
		return {
			shouldOpen: result.shouldOpen,
			resolvedSurfaceId: result.resolvedSurfaceId,
		}
	}

	readonly notifyOpenedDiscoveredSurface = async (info: OpenDeviceResult): Promise<void> => {
		this.#ipcWrapper.sendWithNoCb('notifyOpenedDiscoveredDevice', {
			info: {
				...info,
				configFields: info.configFields ?? null,
			},
		})
	}

	readonly forgetDiscoveredSurfaces = (devicePaths: string[]): void => {
		this.#ipcWrapper.sendWithNoCb('forgetDiscoveredSurfaces', { devicePaths })
	}

	readonly connectionsFound = (_connectionInfos: unknown[]): void => {
		this.#ipcWrapper.sendWithNoCb('notifyConnectionsFound', { connectionInfos: _connectionInfos })
	}

	readonly connectionsForgotten = (connectionIds: string[]): void => {
		this.#ipcWrapper.sendWithNoCb('notifyConnectionsForgotten', { connectionIds })
	}
}
