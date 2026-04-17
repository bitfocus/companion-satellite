import { createLogger } from '../logging.js'
import { uint8ArrayToBuffer } from '../graphics/lib.js'
import type { RespawnMonitor } from '../lib/respawn.js'
import { IpcWrapper, type IpcEventHandlers } from '../lib/ipc-wrapper.js'
import type {
	CheckDeviceInfo,
	DisconnectMessage,
	FirmwareUpdateInfoMessage,
	ForgetDiscoveredSurfacesMessage,
	HostOpenDeviceResult,
	HostToSurfaceModuleEvents,
	InputPressMessage,
	InputRotateMessage,
	LogMessageMessage,
	NotifyConnectionsForgottenMessage,
	NotifyConnectionsFoundMessage,
	NotifyOpenedDeviceMessage,
	PincodeEntryMessage,
	RegisterMessage,
	SetVariableValueMessage,
	ShouldOpenDeviceMessage,
	ShouldOpenDeviceResponseMessage,
	SurfaceModuleToHostEvents,
} from './ipc-types.js'
import type { HIDDevice, CheckDeviceResult, OpenDeviceResult } from '@companion-surface/host'
import type { ApiSurfacePluginInfo } from '../apiTypes.js'
import { nanoid } from 'nanoid'

export interface ChildHandlerDependencies {
	/** Resolve + register a unique surface ID — returns the stable resolved ID */
	resolveUniqueSurfaceId(
		baseSurfaceId: string,
		surfaceIdIsNotUnique: boolean,
		pluginId: string,
		devicePath: string,
	): string

	/** Forget a discovered surface by device path */
	forgetSurfaceId(pluginId: string, devicePath: string): void

	/** Called when the child notifies that a detected surface has been opened */
	notifyOpenedDiscoveredSurface(pluginId: string, info: OpenDeviceResult): void

	/** Called when a surface disconnects */
	onSurfaceDisconnected(surfaceId: string): void

	/** Called on input from a surface to Companion */
	onInputPress(surfaceId: string, controlId: string, pressed: boolean): void
	onInputRotate(surfaceId: string, controlId: string, delta: number): void
	onChangePage(surfaceId: string, forward: boolean): void
	onPincodeEntry(surfaceId: string, keycode: number): void
	onSetVariableValue(surfaceId: string, name: string, value: unknown): void
	onFirmwareUpdateInfo(surfaceId: string, updateUrl: string | null): void
}

export interface ChildHandlerFeatures {
	readonly supportsDetection: boolean
	readonly supportsHid: boolean
	readonly supportsScan: boolean
	readonly supportsOutbound: boolean
}

export class ChildHandler {
	readonly #logger
	readonly #ipcWrapper: IpcWrapper<HostToSurfaceModuleEvents, SurfaceModuleToHostEvents>
	readonly #deps: ChildHandlerDependencies
	readonly #unsubListeners: () => void

	readonly info: ApiSurfacePluginInfo
	readonly #verificationToken: string

	#features: ChildHandlerFeatures = {
		supportsDetection: false,
		supportsHid: false,
		supportsScan: false,
		supportsOutbound: false,
	}

	get features(): ChildHandlerFeatures {
		return this.#features
	}

	/** Relevant HID device vendor/product IDs — used for pre-filtering in scanForSurfaces */
	readonly usbIds: Array<{ vendorId: number; productIds: number[] }>

	constructor(
		info: ApiSurfacePluginInfo,
		usbIds: Array<{ vendorId: number; productIds: number[] }>,
		monitor: RespawnMonitor,
		deps: ChildHandlerDependencies,
		onRegister: (token: string) => Promise<void>,
	) {
		this.#logger = createLogger(`SurfaceThread/${info.pluginId}`)
		this.info = info
		this.usbIds = usbIds
		this.#deps = deps
		this.#verificationToken = nanoid()

		const handlers: IpcEventHandlers<SurfaceModuleToHostEvents> = {
			register: async (msg: RegisterMessage) => {
				await onRegister(msg.verificationToken)
				this.#onRegister(msg)
				return {}
			},
			disconnect: async (msg: DisconnectMessage) => {
				this.#deps.onSurfaceDisconnected(msg.surfaceId)
			},
			shouldOpenDiscoveredSurface: this.#handleShouldOpenDiscoveredSurface.bind(this),
			notifyOpenedDiscoveredDevice: async (msg: NotifyOpenedDeviceMessage) => {
				this.#deps.notifyOpenedDiscoveredSurface(this.info.pluginId, this.#convertResult(msg.info))
			},
			forgetDiscoveredSurfaces: async (msg: ForgetDiscoveredSurfacesMessage) => {
				for (const devicePath of msg.devicePaths) {
					this.#deps.forgetSurfaceId(this.info.pluginId, devicePath)
				}
			},
			notifyConnectionsFound: async (_msg: NotifyConnectionsFoundMessage) => {
				// Not used by satellite
			},
			notifyConnectionsForgotten: async (_msg: NotifyConnectionsForgottenMessage) => {
				// Not used by satellite
			},
			'log-message': async (msg: LogMessageMessage) => {
				const source = msg.source ? `[${msg.source}]` : ''
				const logFn = this.#logger[msg.level as keyof typeof this.#logger]
				if (typeof logFn === 'function') {
					;(logFn as (m: string) => void).call(this.#logger, `${source} ${msg.message}`)
				} else {
					this.#logger.info(`${source} [${msg.level}] ${msg.message}`)
				}
			},
			'input-press': async (msg: InputPressMessage) => {
				this.#deps.onInputPress(msg.surfaceId, msg.controlId, msg.pressed)
			},
			'input-rotate': async (msg: InputRotateMessage) => {
				this.#deps.onInputRotate(msg.surfaceId, msg.controlId, msg.delta)
			},
			'change-page': async (msg) => {
				this.#deps.onChangePage(msg.surfaceId, msg.forward)
			},
			'pincode-entry': async (msg: PincodeEntryMessage) => {
				this.#deps.onPincodeEntry(msg.surfaceId, msg.keycode)
			},
			'set-variable-value': async (msg: SetVariableValueMessage) => {
				this.#deps.onSetVariableValue(msg.surfaceId, msg.name, msg.value)
			},
			'firmware-update-info': async (msg: FirmwareUpdateInfoMessage) => {
				this.#deps.onFirmwareUpdateInfo(
					msg.surfaceId,
					msg.updateInfo?.updateUrl ?? null,
				)
			},
		}

		this.#ipcWrapper = new IpcWrapper(
			handlers,
			(msg) => {
				if (monitor.child) {
					monitor.child.send(msg)
				} else {
					this.#logger.debug(`Child not running, unable to send: ${JSON.stringify(msg)}`)
				}
			},
			5000,
		)

		const messageHandler = (msg: any) => {
			this.#ipcWrapper.receivedMessage(msg)
		}
		monitor.on('message', messageHandler)
		this.#unsubListeners = () => monitor.off('message', messageHandler)
	}

	getVerificationToken(): string {
		return this.#verificationToken
	}

	#onRegister(msg: RegisterMessage): void {
		this.#features = {
			supportsDetection: !!msg.supportsDetection,
			supportsHid: !!msg.supportsHid,
			supportsScan: !!msg.supportsScan,
			supportsOutbound: !!msg.supportsOutbound,
		}
		this.#logger.debug(`Registered with features: ${JSON.stringify(this.#features)}`)
	}

	async #handleShouldOpenDiscoveredSurface(
		msg: ShouldOpenDeviceMessage,
	): Promise<ShouldOpenDeviceResponseMessage> {
		const resolvedSurfaceId = this.#deps.resolveUniqueSurfaceId(
			msg.info.surfaceId,
			msg.info.surfaceIdIsNotUnique,
			this.info.pluginId,
			msg.info.devicePath,
		)
		return { shouldOpen: true, resolvedSurfaceId }
	}

	#convertResult(result: HostOpenDeviceResult): OpenDeviceResult {
		return {
			...result,
			configFields: result.configFields ?? null,
		}
	}

	async init(): Promise<void> {
		await this.#ipcWrapper.sendWithCb('init', {})
	}

	destroy(): void {
		this.#unsubListeners()
		this.#ipcWrapper.sendWithCb('destroy', {}).catch((e) => {
			this.#logger.warn(`Destroy errored: ${e}`)
		})
	}

	// ── Surface-level commands (fire and forget) ──────────────────────────────

	async showStatus(surfaceId: string, displayHost: string, message: string): Promise<void> {
		await this.#ipcWrapper
			.sendWithCb('showStatus', { surfaceId, displayHost, message })
			
	}

	async setBrightness(surfaceId: string, brightness: number): Promise<void> {
		await this.#ipcWrapper
			.sendWithCb('setBrightness', { surfaceId, brightness })
	}

	async blankSurface(surfaceId: string): Promise<void> {
		await this.#ipcWrapper
			.sendWithCb('blankSurface', { surfaceId })
	}

	async draw(surfaceId: string, drawProps: Array<{ controlId: string; image?: Uint8Array; color?: string; text?: string; pageNumber?: number }>): Promise<void> {
		await this.#ipcWrapper
			.sendWithCb('drawControls', {
				surfaceId,
				drawProps: drawProps.map((d) => ({
					...d,
					image: d.image ? uint8ArrayToBuffer(d.image).toString('base64') : undefined,
				})),
			})
	}

	async showLockedStatus(surfaceId: string, locked: boolean, characterCount: number): Promise<void> {
		await this.#ipcWrapper
			.sendWithCb('setLocked', { surfaceId, locked, characterCount })
	}

	async onVariableValue(surfaceId: string, name: string, value: unknown): Promise<void> {
		await this.#ipcWrapper
			.sendWithCb('setOutputVariable', { surfaceId, name, value: value as any })
	}

	async readySurface(surfaceId: string, config: Record<string, unknown>): Promise<void> {
		await this.#ipcWrapper.sendWithCb('readySurface', { surfaceId, initialConfig: config })
	}

	async updateConfig(surfaceId: string, config: Record<string, unknown>): Promise<void> {
		await this.#ipcWrapper.sendWithCb('updateConfig', { surfaceId, newConfig: config })
	}

	// ── Scan / open ──────────────────────────────────────────────────────────

	async checkHidDevices(devices: HIDDevice[]): Promise<CheckDeviceInfo[]> {
		const result = await this.#ipcWrapper.sendWithCb('checkHidDevices', { devices })
		return result.devices
	}

	async scanForDevices(): Promise<CheckDeviceInfo[]> {
		const result = await this.#ipcWrapper.sendWithCb('scanDevices', {})
		return result.devices
	}

	async openHidDevice(device: HIDDevice, resolvedSurfaceId: string): Promise<OpenDeviceResult | null> {
		const result = await this.#ipcWrapper.sendWithCb('openHidDevice', { device, resolvedSurfaceId })
		if (!result.info) return null
		return this.#convertResult(result.info)
	}

	async openScannedDevice(device: CheckDeviceInfo, resolvedSurfaceId: string): Promise<OpenDeviceResult | null> {
		const result = await this.#ipcWrapper.sendWithCb('openScannedDevice', { device, resolvedSurfaceId })
		if (!result.info) return null
		return this.#convertResult(result.info)
	}

	isRelevantHidDevice(vendorId: number, productId: number): boolean {
		for (const entry of this.usbIds) {
			if (entry.vendorId === vendorId && entry.productIds.includes(productId)) return true
		}
		return false
	}

	/** Check whether this device's surfaceId belongs to this plugin — used to find the owning plugin for a given device */
	checkDeviceResult(result: CheckDeviceResult): boolean {
		return !!result
	}
}
