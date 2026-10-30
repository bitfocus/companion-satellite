import { EventEmitter } from 'events'
import { assertNever, Complete, DEFAULT_TCP_PORT } from '../lib.js'
import {
	CompanionSatelliteTcpClient,
	CompanionSatelliteWsClient,
	formatConnectionUrl,
	ICompanionSatelliteClient,
	ICompanionSatelliteClientOptions,
	SomeConnectionDetails,
} from './socketImplementations.js'
import type {
	SatelliteConfigFields,
	SatelliteControlDefinition,
	SatelliteSurfaceLayout,
} from '@companion-app/satellite-protocol/schemas'
import {
	formatSatelliteMessage,
	parseLineParameters,
	SatelliteLineBuffer,
	splitSatelliteCommand,
	decodeSatelliteVariableValue,
	isTruthy,
	encodeSatelliteVariableValue,
	parseSatelliteVariableEncoding,
	type ParsedParams,
	type SatelliteMessageArgs,
} from '@companion-app/satellite-protocol/codec'
import { MAX_LINE_LENGTH } from '@companion-app/satellite-protocol/constants'
import { getSatelliteFeatures, isApiVersionAtLeast } from '@companion-app/satellite-protocol/versions'
import { stripUnsupportedManifestFeatures } from '../translateSchema.js'
import type { GridSize } from '@companion-surface/host'

const PING_UNACKED_LIMIT = 15 // Arbitrary number
const PING_IDLE_TIMEOUT = 1000 // Pings are allowed to be late if another packet has been received recently
const PING_INTERVAL = 100
const RECONNECT_DELAY = 1000
const RECONNECT_DELAY_UNSUPPORTED = 30000

const MINIMUM_PROTOCOL_VERSION = '1.7.0' // Companion 3.4

// Compressed bitmap encodings we can decode (via @julusian/image-rs), in order of preference.
// Companion advertises which it can stream via the CAPS `BITMAP_FORMATS` field (API v1.12+).
// We negotiate the first of these that is available, falling back to raw `rgb` otherwise.
const PREFERRED_BITMAP_FORMATS = ['webp', 'png'] as const

// Upper bound on the steps sent for a single rotation, matching what Companion will accept
const MAX_ROTATION_STEPS = 100

export interface CompanionSatelliteClientOptions {
	debug?: boolean
}

export interface CompanionSatelliteClientDrawProps {
	deviceId: string
	keyIndex: number | undefined
	controlId: string | undefined
	image?: string // base64 raw rgb pixels, or a `data:` url for compressed (png/webp) bitmaps
	color?: string // hex
	textColor?: string // hex
	text?: string
	fontSize?: number
	type?: string
	pressed?: boolean
	location?: string
	leds?: string // base64 packed raw rgb, 3 bytes per LED segment
}

export interface DeviceRegisterProps {
	serialNumber: string
	serialIsUnique: boolean

	brightness: boolean
	surfaceManifest: SatelliteSurfaceLayout
	transferVariables: Array<DeviceRegisterInputVariable | DeviceRegisterOutputVariable> | undefined
	configFields: SatelliteConfigFields | undefined
	canChangePage: { label: string } | undefined

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

export type CompanionSatelliteClientEvents = {
	error: [Error]
	log: [string]
	connected: []
	connecting: []
	disconnected: []

	draw: [CompanionSatelliteClientDrawProps]
	brightness: [{ deviceId: string; percent: number }]
	newDevice: [{ deviceId: string }]
	clearDeck: [{ deviceId: string }]
	variableValue: [{ deviceId: string; name: string; value: unknown }]
	lockedState: [{ deviceId: string; locked: boolean; characterCount: number; rotation?: 0 | 90 | -90 | 180 }]
	deviceErrored: [{ deviceId: string; message: string }]
	deviceConfig: [{ deviceId: string; config: Record<string, unknown> }]
}

export class CompanionSatelliteClient extends EventEmitter<CompanionSatelliteClientEvents> {
	private readonly debug: boolean
	private socket: ICompanionSatelliteClient | undefined

	private readonly lineBuffer = new SatelliteLineBuffer(MAX_LINE_LENGTH)

	private _pingInterval: NodeJS.Timeout | undefined
	private _pingUnackedCount = 0
	private _lastReceivedAt = 0
	private _connected = false
	private _connectionActive = false // True when connected/connecting/reconnecting
	private _retryConnectTimeout: NodeJS.Timeout | undefined = undefined
	private _connectionDetails: SomeConnectionDetails = { mode: 'tcp', host: '', port: DEFAULT_TCP_PORT }

	private _registeredDevices = new Set<string>()
	private _pendingDevices = new Map<string, number>() // Time submitted

	private _companionVersion: string | null = null
	private _companionApiVersion: string | null = null
	private _companionUnsupported = false

	private _supportsLocalLockState = false
	private _supportsSurfaceManifest = false
	private _supportsDeviceSerial = false
	private _supportsSubscriptions = false
	private _supportsNonSquareBitmaps = false
	private _supportsLedsCapability = false
	private _supportsRotaryAmount = false
	private _supportsJsonVariableValues = false
	private _supportsBitmapCache = false

	/** The cache budget, as a number of full size bitmaps for each button of the connected surfaces. 0 disables it */
	private _bitmapCacheBitmapsPerButton = 0
	/** The bitmaps Companion has told us to cache for this connection, by id (API v1.16+) */
	private readonly _bitmapCache = new Map<string, string>()
	/** The budget last sent to Companion with BITMAP-CACHE */
	private _bitmapCacheBudgetSent = 0
	private _bitmapCacheUpdatePending = false
	/** The size as RGBA of one bitmap for every button of each device, for scaling the cache budget */
	private readonly _deviceBitmapBytes = new Map<string, number>()
	private _companionBitmapFormats: string[] = []
	private _pendingConnected = false
	/** True once BEGIN (and CAPS, when expected) have been processed for the current socket */
	private _handshakeComplete = false

	public get connectionDetails(): SomeConnectionDetails {
		return this._connectionDetails
	}
	public get connected(): boolean {
		return this._connected
	}
	public get companionVersion(): string | null {
		return this._companionVersion
	}
	public get companionApiVersion(): string | null {
		return this._companionApiVersion
	}
	public get companionUnsupported(): boolean {
		return this._companionUnsupported
	}

	public get supportsLocalLockState(): boolean {
		return this._supportsLocalLockState
	}
	public get supportsSurfaceManifest(): boolean {
		return this._supportsSurfaceManifest
	}
	public get supportsDeviceSerial(): boolean {
		return this._supportsDeviceSerial
	}
	public get supportsSubscriptions(): boolean {
		return this._supportsSubscriptions
	}
	public get supportsNonSquareBitmaps(): boolean {
		return this._supportsNonSquareBitmaps
	}
	/** Whether Companion supports addressable-LED controls (`leds` capability, API v1.13.0+) */
	public get supportsLeds(): boolean {
		return this._supportsLedsCapability
	}

	/**
	 * The compressed bitmap encoding negotiated with Companion, or `rgb` if none is available.
	 * Compressed bitmaps arrive as self-describing data urls, raw `rgb` as base64 pixel data.
	 */
	private get negotiatedBitmapFormat(): 'rgb' | (typeof PREFERRED_BITMAP_FORMATS)[number] {
		for (const format of PREFERRED_BITMAP_FORMATS) {
			if (this._companionBitmapFormats.includes(format)) return format
		}
		return 'rgb'
	}

	public get displayHost(): string {
		switch (this._connectionDetails.mode) {
			case 'tcp':
				return this._connectionDetails.host
			case 'ws':
				try {
					const url = new URL(this._connectionDetails.url)
					return url.hostname
				} catch (_e) {
					return this._connectionDetails.url
				}
			default:
				assertNever(this._connectionDetails)
				return ''
		}
	}

	public get capabilities(): ClientCapabilities {
		return {
			supportsSurfaceManifest: this._supportsSurfaceManifest,
		}
	}

	constructor(options: CompanionSatelliteClientOptions = {}) {
		super()

		this.debug = !!options.debug

		// Don't auto initSocket, as that can trigger an uncaught error
	}

	private initSocket(): void {
		if (this.socket) {
			this.socket.destroy()
			this.socket = undefined
		}

		if (!this._connectionDetails) {
			this.emit('log', `Missing connection details`)
			return
		}

		const socketOptions: ICompanionSatelliteClientOptions = {
			onError: (e) => {
				this.emit('error', e)
			},
			onClose: () => {
				if (this.debug) {
					this.emit('log', 'Connection closed')
				}

				this._registeredDevices.clear()
				this._pendingDevices.clear()

				this._supportsSubscriptions = false
				this._companionBitmapFormats = []
				this.resetBitmapCache()
				this._pendingConnected = false
				this._handshakeComplete = false
				if (this._connected) {
					this.emit('disconnected')
				} else {
					this._companionUnsupported = false
				}
				this._connected = false
				this.lineBuffer.clear()

				if (this._pingInterval) {
					clearInterval(this._pingInterval)
					this._pingInterval = undefined
				}

				if (!this._retryConnectTimeout && this.socket === socket) {
					this._retryConnectTimeout = setTimeout(
						() => {
							this._retryConnectTimeout = undefined
							this.emit('log', 'Trying reconnect')
							this.initSocket()
						},
						this._companionUnsupported ? RECONNECT_DELAY_UNSUPPORTED : RECONNECT_DELAY,
					)
				}
			},
			onData: (d) => this._handleReceivedData(d),
			onConnect: () => {
				if (this.debug) {
					this.emit('log', 'Connected')
				}

				this._registeredDevices.clear()
				this._pendingDevices.clear()

				this._connected = true
				this._handshakeComplete = false
				this._pingUnackedCount = 0
				this.lineBuffer.clear()

				if (!this._pingInterval) {
					this._pingInterval = setInterval(() => this.sendPing(), PING_INTERVAL)
				}

				if (!this.socket) {
					// should never hit, but just in case
					this.disconnect()
					return
				}

				// 'connected' gets emitted once we receive 'Begin'
			},
		}

		let socket: ICompanionSatelliteClient
		switch (this._connectionDetails.mode) {
			case 'tcp':
				socket = new CompanionSatelliteTcpClient(socketOptions, this._connectionDetails)
				break
			case 'ws':
				socket = new CompanionSatelliteWsClient(socketOptions, this._connectionDetails)
				break
			default:
				assertNever(this._connectionDetails)
				this.socket = undefined
				throw new Error('Invalid connection mode')
		}
		this.socket = socket

		this.emit('log', `Connecting to ${formatConnectionUrl(this._connectionDetails)}`)
	}

	private sendPing(): void {
		if (this._connected && this.socket) {
			if (this._pingUnackedCount > PING_UNACKED_LIMIT && this._lastReceivedAt <= Date.now() - PING_IDLE_TIMEOUT) {
				// Ping was never acked, so it looks like a timeout
				this.emit('log', 'ping timeout')
				try {
					this.socket.destroy()
				} catch (_e) {
					// ignore
				}
				return
			}

			this._pingUnackedCount++
			this.socket.write('PING\n')
		}
	}

	public async connect(details: SomeConnectionDetails): Promise<void> {
		if (this._connected || this._connectionActive) {
			this.disconnect()
		}
		this._connectionActive = true

		setImmediate(() => {
			this.emit('connecting')
		})

		this._connectionDetails = { ...details }

		this.initSocket()
	}

	public disconnect(): void {
		this._connectionActive = false
		if (this._retryConnectTimeout) {
			clearTimeout(this._retryConnectTimeout)
			delete this._retryConnectTimeout
		}

		if (this._pingInterval) {
			clearInterval(this._pingInterval)
			delete this._pingInterval
		}

		if (!this._connected) {
			return
		}

		try {
			this.socket?.end()
			this.socket = undefined
		} catch (e) {
			this.socket = undefined
			throw e
		}
	}

	private _handleReceivedData(data: string): void {
		this._lastReceivedAt = Date.now()
		const { lines, overflow } = this.lineBuffer.push(data)
		for (const line of lines) this.handleCommand(line)
		if (overflow) {
			this.emit('log', 'Received line too long, reconnecting')
			this.socket?.destroy()
		}
	}

	private handleCommand(line: string): void {
		const { command: cmd, body } = splitSatelliteCommand(line)
		const params = parseLineParameters(body)

		switch (cmd.toUpperCase()) {
			case 'PING':
				this.socket?.write(`PONG ${body}\n`)
				break
			case 'PONG':
				// this.emit('log','Got pong')
				this._pingUnackedCount = 0
				break
			case 'KEY-STATE':
				this.handleState(params)
				break
			case 'KEYS-CLEAR':
				this.handleClear(params)
				break
			case 'VARIABLE-VALUE':
				this.handleVariableValue(params)
				break
			case 'LOCKED-STATE':
				this.handleLockedState(params)
				break
			case 'BRIGHTNESS':
				this.handleBrightness(params)
				break
			case 'ADD-DEVICE':
				this.handleAddedDevice(params)
				break
			case 'REMOVE-DEVICE':
				this.emit('log', `Removed device: ${body}`)
				break
			case 'BEGIN':
				this.emit('log', `Connected to Companion: ${body}`)
				this.handleBegin(params)
				break
			case 'CAPS':
				this.handleCaps(params)
				break
			case 'DEVICE-CONFIG':
				this.handleDeviceConfig(params)
				break
			case 'BITMAP-CACHE':
				this.handleBitmapCache(params)
				break
			case 'BITMAP-EVICT':
				this.handleBitmapEvict(params)
				break
			case 'BITMAP-COST':
				// Only replied to on error
				if (params.ERROR) this.emit('log', `Bitmap cost failed: ${JSON.stringify(params)}`)
				break
			case 'SUB-STATE':
				// Subscription state updates - not currently used
				break
			case 'KEY-PRESS':
			case 'KEY-ROTATE':
			case 'SET-VARIABLE-VALUE':
			case 'PINCODE-KEY':
			case 'FIRMWARE-UPDATE-INFO':
				// Ignore echoes of our own messages
				break
			default:
				this.emit('log', `Received unhandled command: ${cmd} ${body}`)
				break
		}
	}

	private handleBegin(params: ParsedParams): void {
		this._companionVersion = typeof params.CompanionVersion === 'string' ? params.CompanionVersion : null
		this._companionApiVersion = typeof params.ApiVersion === 'string' ? params.ApiVersion : null

		const apiVersion = this._companionApiVersion ?? ''

		// Check if the companion is supported. A malformed version is treated as unsupported
		this._companionUnsupported = !isApiVersionAtLeast(apiVersion, MINIMUM_PROTOCOL_VERSION)
		if (this._companionUnsupported) {
			this.emit(
				'log',
				`Connected to unsupported Companion version. Companion ${this._companionVersion}, API ${this._companionApiVersion}`,
			)
			this.socket?.end()
			return
		}

		// Perform api version checks
		const features = getSatelliteFeatures(apiVersion, null)
		this._supportsLocalLockState = features.lockState
		if (this._supportsLocalLockState) {
			this.emit('log', 'Companion supports delegating locking drawing')
		}
		this._supportsSurfaceManifest = features.surfaceManifest
		if (this._supportsSurfaceManifest) {
			this.emit('log', 'Companion supports surface manifest')
		}
		this._supportsDeviceSerial = features.deviceSerial
		if (this._supportsDeviceSerial) {
			this.emit('log', 'Companion supports separate serial value')
		}
		this._supportsLedsCapability = features.leds
		if (this._supportsLedsCapability) {
			this.emit('log', 'Companion supports addressable LEDs')
		}
		this._supportsJsonVariableValues = features.jsonVariableValues
		if (this._supportsJsonVariableValues) {
			this.emit('log', 'Companion supports json variable values')
		}
		this._supportsNonSquareBitmaps = false
		this._supportsSubscriptions = false
		this._supportsRotaryAmount = false
		this._companionBitmapFormats = []
		this.resetBitmapCache()

		// Defer emitting connected until CAPS is received (added in API 1.10.0)
		this._pendingConnected = true
		const expectCaps = features.caps
		if (!expectCaps) {
			// Older Companion versions don't send CAPS, complete immediately
			this.completeConnection()
		}
		// For API >= 1.10.0, CAPS is required by spec — wait for it unconditionally.
		// If it never arrives the ping-timeout will disconnect and trigger a reconnect.
	}

	private handleState(params: ParsedParams): void {
		if (typeof params.DEVICEID !== 'string') {
			this.emit('log', 'Missing DEVICEID in KEY-STATE response')
			return
		}

		let keyIndex: number | undefined
		let controlId: string | undefined
		if (typeof params.CONTROLID === 'string') {
			controlId = params.CONTROLID
		} else if (typeof params.KEY === 'string') {
			keyIndex = parseInt(params.KEY)
			if (isNaN(keyIndex)) {
				this.emit('log', 'Bad KEY in KEY-STATE response')
				return
			}
		}

		if (keyIndex === undefined && controlId === undefined) {
			this.emit('log', 'Missing KEY and CONTROLID in KEY-STATE response')
			return
		}

		const image = this.resolveStateBitmap(params)
		const text = typeof params.TEXT === 'string' ? Buffer.from(params.TEXT, 'base64').toString() : undefined
		const color = typeof params.COLOR === 'string' ? params.COLOR : undefined
		const textColor = typeof params.TEXTCOLOR === 'string' ? params.TEXTCOLOR : undefined
		const fontSize = typeof params.FONT_SIZE === 'string' ? parseInt(params.FONT_SIZE) : undefined
		const type = typeof params.TYPE === 'string' ? params.TYPE : undefined
		const pressed = typeof params.PRESSED === 'string' ? params.PRESSED === '1' : undefined
		const location = typeof params.LOCATION === 'string' ? params.LOCATION : undefined
		// LEDS is always base64 of a packed raw-rgb buffer (3 bytes per segment), never a data url.
		const leds = typeof params.LEDS === 'string' ? params.LEDS : undefined

		this.emit('draw', {
			deviceId: params.DEVICEID,
			keyIndex,
			controlId,
			image,
			text,
			color,
			textColor,
			fontSize: fontSize !== undefined && !isNaN(fontSize) ? fontSize : undefined,
			type,
			pressed,
			location,
			leds,
		} satisfies Complete<CompanionSatelliteClientDrawProps>)
	}
	private handleClear(params: ParsedParams): void {
		if (typeof params.DEVICEID !== 'string') {
			this.emit('log', 'Mising DEVICEID in KEYS-CLEAR response')
			return
		}

		this.emit('clearDeck', { deviceId: params.DEVICEID })
	}
	private handleVariableValue(params: ParsedParams) {
		if (typeof params.DEVICEID !== 'string') {
			this.emit('log', 'Mising DEVICEID in VARIABLE-VALUE response')
			return
		}
		if (typeof params.VARIABLE !== 'string') {
			this.emit('log', 'Missing VARIABLE in VARIABLE-VALUE response')
			return
		}
		if (typeof params.VALUE !== 'string') {
			this.emit('log', 'Missing VALUE in VARIABLE-VALUE response')
			return
		}

		// ENCODING is only sent as json, when VARIABLE_ENCODING=json was requested in ADD-DEVICE (API v1.16+)
		const encoding = parseSatelliteVariableEncoding(params.ENCODING)
		if (!encoding) {
			this.emit('log', `Unknown ENCODING in VARIABLE-VALUE response: ${params.ENCODING}`)
			return
		}

		let value: unknown
		try {
			value = decodeSatelliteVariableValue(Buffer.from(params.VALUE, 'base64').toString(), encoding)
		} catch (_e) {
			this.emit('log', 'Bad VALUE in VARIABLE-VALUE response')
			return
		}

		this.emit('variableValue', {
			deviceId: params.DEVICEID,
			name: params.VARIABLE,
			value,
		})
	}

	private handleLockedState(params: ParsedParams) {
		if (typeof params.DEVICEID !== 'string') {
			this.emit('log', 'Mising DEVICEID in LOCKED-STATE response')
			return
		}
		if (typeof params.LOCKED !== 'string') {
			this.emit('log', 'Missing LOCKED in LOCKED-STATE response')
			return
		}
		if (typeof params.CHARACTER_COUNT !== 'string') {
			this.emit('log', 'Missing CHARACTER_COUNT in LOCKED-STATE response')
			return
		}

		const rotationRaw = typeof params.ROTATION === 'string' ? Number(params.ROTATION) : undefined
		const rotation =
			rotationRaw === 0 || rotationRaw === 90 || rotationRaw === -90 || rotationRaw === 180
				? rotationRaw
				: undefined
		this.emit('lockedState', {
			deviceId: params.DEVICEID,
			locked: params.LOCKED === '1',
			characterCount: Number(params.CHARACTER_COUNT),
			rotation,
		})
	}

	private handleBrightness(params: ParsedParams): void {
		if (typeof params.DEVICEID !== 'string') {
			this.emit('log', 'Missing DEVICEID in BRIGHTNESS response')
			return
		}
		if (typeof params.VALUE !== 'string') {
			this.emit('log', 'Missing VALUE in BRIGHTNESS response')
			return
		}
		const percent = parseInt(params.VALUE)
		if (isNaN(percent)) {
			this.emit('log', 'Bad VALUE in BRIGHTNESS response')
			return
		}
		this.emit('brightness', { deviceId: params.DEVICEID, percent })
	}

	private handleAddedDevice(params: ParsedParams): void {
		if (!params.OK || params.ERROR) {
			this.emit('log', `Add device failed: ${JSON.stringify(params)}`)
			if (typeof params.DEVICEID === 'string') {
				if (this._deviceBitmapBytes.delete(params.DEVICEID)) this.scheduleBitmapCacheUpdate()

				this.emit('deviceErrored', {
					deviceId: params.DEVICEID,
					message: `${params.MESSAGE || 'Unknown Error'}`,
				})
			}
			return
		}
		if (typeof params.DEVICEID !== 'string') {
			this.emit('log', 'Missing DEVICEID in ADD-DEVICE response')
			return
		}

		this._registeredDevices.add(params.DEVICEID)
		this._pendingDevices.delete(params.DEVICEID)

		this.emit('newDevice', { deviceId: params.DEVICEID })
	}

	private handleCaps(params: ParsedParams): void {
		const features = getSatelliteFeatures(this._companionApiVersion ?? '', params)

		this._supportsSubscriptions = features.subscriptions
		if (this._supportsSubscriptions) {
			this.emit('log', 'Companion supports button subscriptions')
		}
		this._supportsNonSquareBitmaps = features.nonSquareBitmaps
		if (this._supportsNonSquareBitmaps) {
			this.emit('log', 'Companion supports non-square bitmaps')
		}
		this._supportsRotaryAmount = features.rotaryAmount
		if (this._supportsRotaryAmount) {
			this.emit('log', 'Companion supports rotation amounts')
		}
		this._supportsBitmapCache = features.bitmapCache
		if (this._supportsBitmapCache) {
			this.emit('log', 'Companion supports bitmap caching')
		}

		// BITMAP_FORMATS is a comma-separated list of bitmap encodings Companion can stream (API v1.12+)
		this._companionBitmapFormats =
			typeof params.BITMAP_FORMATS === 'string'
				? params.BITMAP_FORMATS.split(',')
						.map((f) => f.trim().toLowerCase())
						.filter(Boolean)
				: []
		const negotiatedBitmapFormat = this.negotiatedBitmapFormat
		if (negotiatedBitmapFormat !== 'rgb') {
			this.emit('log', `Companion supports compressed bitmaps, using '${negotiatedBitmapFormat}'`)
		}

		this.completeConnection()
	}

	private completeConnection(): void {
		if (!this._pendingConnected) return
		this._pendingConnected = false
		const socket = this.socket
		setImmediate(() => {
			if (!this._connected || this.socket !== socket) return
			this._handshakeComplete = true
			this.emit('connected')
		})
	}

	private handleDeviceConfig(params: ParsedParams): void {
		if (typeof params.DEVICEID !== 'string') {
			this.emit('log', 'Missing DEVICEID in DEVICE-CONFIG response')
			return
		}
		if (typeof params.CONFIG !== 'string') {
			this.emit('log', 'Missing CONFIG in DEVICE-CONFIG response')
			return
		}

		try {
			const config = JSON.parse(Buffer.from(params.CONFIG, 'base64').toString()) as Record<string, unknown>
			this.emit('deviceConfig', { deviceId: params.DEVICEID, config })
		} catch (_e) {
			this.emit('log', 'Bad CONFIG in DEVICE-CONFIG response')
		}
	}

	public keyDown(deviceId: string, controlId: string, controlDefinition: SatelliteControlDefinition): void {
		if (this._connected && this.socket) {
			this.sendMessage('KEY-PRESS', null, deviceId, {
				CONTROLID: controlId,
				KEY: `${controlDefinition.row}/${controlDefinition.column}`,
				PRESSED: true,
			})
		}
	}
	public keyUp(deviceId: string, controlId: string, controlDefinition: SatelliteControlDefinition): void {
		if (this._connected && this.socket) {
			this.sendMessage('KEY-PRESS', null, deviceId, {
				CONTROLID: controlId,
				KEY: `${controlDefinition.row}/${controlDefinition.column}`,
				PRESSED: false,
			})
		}
	}
	public rotate(
		deviceId: string,
		controlId: string,
		controlDefinition: SatelliteControlDefinition,
		delta: number,
	): void {
		if (this._connected && this.socket) {
			// DIRECTION carries the signed step count when Companion supports it (API v1.14+), otherwise a single step
			const steps = this._supportsRotaryAmount
				? Math.min(MAX_ROTATION_STEPS, Math.max(1, Math.trunc(Math.abs(delta))))
				: 1
			this.sendMessage('KEY-ROTATE', null, deviceId, {
				CONTROLID: controlId,
				KEY: `${controlDefinition.row}/${controlDefinition.column}`,
				DIRECTION: delta < 0 ? -steps : steps,
			})
		}
	}
	public pincodeKey(deviceId: string, keyCode: number): void {
		if (this._connected && this.socket) {
			this.sendMessage('PINCODE-KEY', null, deviceId, {
				KEY: keyCode,
			})
		}
	}
	public sendVariableValue(deviceId: string, variable: string, value: unknown): void {
		if (this._connected && this.socket) {
			// Send as JSON to preserve the type of the value (API v1.16+)
			const encoding = this._supportsJsonVariableValues ? 'json' : 'string'
			this.sendMessage('SET-VARIABLE-VALUE', null, deviceId, {
				VARIABLE: variable,
				VALUE: Buffer.from(encodeSatelliteVariableValue(value, encoding)).toString('base64'),
				...(encoding === 'json' ? { ENCODING: encoding } : {}),
			})
		}
	}

	public changePage(deviceId: string, forward: boolean): void {
		if (this._connected && this.socket) {
			this.sendMessage('CHANGE-PAGE', null, deviceId, {
				DIRECTION: forward ? 1 : 0,
			})
		}
	}

	public sendFirmwareUpdateInfo(deviceId: string, updateUrl: string): void {
		if (this._connected && this.socket) {
			this.sendMessage('FIRMWARE-UPDATE-INFO', null, deviceId, {
				UPDATE_URL: updateUrl,
			})
		}
	}

	public hasDevice(deviceId: string): boolean {
		return this._registeredDevices.has(deviceId) || this._pendingDevices.has(deviceId)
	}

	public addDevice(deviceId: string, productName: string, props: DeviceRegisterProps): void {
		if (this._registeredDevices.has(deviceId)) {
			throw new Error('Device is already registered')
		}

		const pendingTime = this._pendingDevices.get(deviceId)
		if (pendingTime && pendingTime > Date.now() - 10000) {
			throw new Error('Device is already being added')
		}
		if (pendingTime) this._pendingDevices.delete(deviceId)

		// Wait for the handshake, as the capability flags are not valid until then. Any surfaces opened
		// before then get registered by the 'connected' handler.
		if (this._handshakeComplete && this.socket) {
			this._pendingDevices.set(deviceId, Date.now())

			const transferVariables = Buffer.from(JSON.stringify(props.transferVariables ?? [])).toString('base64')

			const neededColours = new Set<string>()
			for (const style of Object.values(props.surfaceManifest.stylePresets)) {
				if (style.colors) {
					neededColours.add(style.colors)
				}
			}
			if (neededColours.size > 1) {
				throw new Error(
					`Surface ${deviceId} has multiple color styles. This is not compatible with all API versions`,
				)
			}

			const commonProps = {
				PRODUCT_NAME: productName,
				VARIABLES: transferVariables,
				BRIGHTNESS: props.brightness,
				PINCODE_LOCK: 'FULL',
			}

			if (this.supportsSurfaceManifest) {
				const serialArgs: SatelliteMessageArgs = this._supportsDeviceSerial
					? { SERIAL: props.serialNumber, SERIAL_IS_UNIQUE: props.serialIsUnique }
					: {}

				const configFieldsArgs: SatelliteMessageArgs =
					props.configFields && this._supportsDeviceSerial // CONFIG_FIELDS added in v1.10.0, same as serial
						? { CONFIG_FIELDS: Buffer.from(JSON.stringify(props.configFields)).toString('base64') }
						: {}

				const canChangePageArgs: SatelliteMessageArgs =
					props.canChangePage && this._supportsDeviceSerial // CAN_CHANGE_PAGE added in v1.10.0
						? { CAN_CHANGE_PAGE: props.canChangePage.label }
						: {}

				// BITMAP_FORMAT requests a compressed bitmap encoding from Companion (API v1.12+).
				// Omit it to keep the default `rgb` encoding when no compressed format was negotiated.
				const bitmapFormat = this.negotiatedBitmapFormat
				const bitmapFormatArgs: SatelliteMessageArgs =
					bitmapFormat !== 'rgb' ? { BITMAP_FORMAT: bitmapFormat } : {}

				// Strip manifest features the connected Companion is too old to understand, so it
				// doesn't reject the whole manifest (it validates with `additionalProperties: false`).
				const manifest = stripUnsupportedManifestFeatures(props.surfaceManifest, {
					supportsLeds: this._supportsLedsCapability,
				})

				// VARIABLE_ENCODING=json asks for output variable values as JSON, preserving their type (API v1.16+)
				const variableEncodingArgs: SatelliteMessageArgs = this._supportsJsonVariableValues
					? { VARIABLE_ENCODING: 'json' }
					: {}

				this._deviceBitmapBytes.set(deviceId, calculateBitmapBytesPerFrame(manifest))
				this.scheduleBitmapCacheUpdate()

				this.sendMessage('ADD-DEVICE', null, deviceId, {
					LAYOUT_MANIFEST: Buffer.from(JSON.stringify(manifest)).toString('base64'),
					...commonProps,
					...serialArgs,
					...configFieldsArgs,
					...canChangePageArgs,
					...bitmapFormatArgs,
					...variableEncodingArgs,
				})
			} else {
				const needsText = Object.values(props.surfaceManifest.stylePresets).some((s) => !!s.text)
				const needsTextStyle = Object.values(props.surfaceManifest.stylePresets).some((s) => !!s.textStyle)

				this.sendMessage('ADD-DEVICE', null, deviceId, {
					KEYS_TOTAL: props.gridSize.columns * props.gridSize.rows,
					KEYS_PER_ROW: props.gridSize.columns,
					BITMAPS: props.fallbackBitmapSize,
					COLORS: neededColours.values().next().value || false,
					TEXT: needsText,
					TEXT_STYLE: needsTextStyle,
					...commonProps,
				})
			}
		}
	}

	public removeDevice(deviceId: string): void {
		if (this._connected && this.socket) {
			this._registeredDevices.delete(deviceId)
			this._pendingDevices.delete(deviceId)

			if (this._deviceBitmapBytes.delete(deviceId)) this.scheduleBitmapCacheUpdate()

			this.sendMessage('REMOVE-DEVICE', null, deviceId, {})
		}
	}

	/**
	 * Set the size of the bitmap cache, as a number of full size bitmaps for each button of the connected surfaces.
	 * 0 disables the cache
	 */
	public setBitmapCacheBitmapsPerButton(bitmapsPerButton: number): void {
		this._bitmapCacheBitmapsPerButton = Math.max(0, bitmapsPerButton)
		this.scheduleBitmapCacheUpdate()
	}

	/**
	 * Forget the cache of a connection, as it only lasts as long as the connection does
	 */
	private resetBitmapCache(): void {
		this._supportsBitmapCache = false
		this._bitmapCache.clear()
		this._bitmapCacheBudgetSent = 0
		this._deviceBitmapBytes.clear()
	}

	/**
	 * Send the budget to Companion once the current batch of changes is done, so that adding several devices
	 * at once sends it only once
	 */
	private scheduleBitmapCacheUpdate(): void {
		if (this._bitmapCacheUpdatePending) return
		this._bitmapCacheUpdatePending = true

		setImmediate(() => {
			this._bitmapCacheUpdatePending = false
			if (!this._handshakeComplete || !this.socket) return

			let budget = 0
			if (this._supportsBitmapCache) {
				let bytesPerFrame = 0
				for (const bytes of this._deviceBitmapBytes.values()) bytesPerFrame += bytes
				budget = Math.floor(bytesPerFrame * this._bitmapCacheBitmapsPerButton)
			}

			// Caching is off until the first non-zero budget, so there is nothing to tell Companion until then
			if (budget === this._bitmapCacheBudgetSent) return
			this._bitmapCacheBudgetSent = budget

			this.emit('log', `Setting bitmap cache budget to ${budget} bytes`)
			this.sendMessage('BITMAP-CACHE', null, null, { BYTES: budget })
		})
	}

	private handleBitmapCache(params: ParsedParams): void {
		if (!params.OK || params.ERROR) {
			this.emit('log', `Bitmap cache failed: ${JSON.stringify(params)}`)
			return
		}

		// Companion evicts everything before confirming a budget of 0, but the cache may only be emptied once this arrives
		if (params.BYTES === '0') this._bitmapCache.clear()
	}

	private handleBitmapEvict(params: ParsedParams): void {
		if (params.ALL !== undefined && isTruthy(params.ALL)) {
			this._bitmapCache.clear()
			return
		}

		if (typeof params.BITMAP_IDS === 'string') {
			for (const id of params.BITMAP_IDS.split(',')) {
				this._bitmapCache.delete(id)
			}
		}
	}

	/**
	 * Find the bitmap to draw for a KEY-STATE, storing it in the cache when Companion asks for that (API v1.16+)
	 */
	private resolveStateBitmap(params: ParsedParams): string | undefined {
		const bitmap = typeof params.BITMAP === 'string' ? params.BITMAP : undefined
		const bitmapId = typeof params.BITMAP_ID === 'string' && params.BITMAP_ID ? params.BITMAP_ID : undefined
		if (!bitmapId) return bitmap

		if (bitmap !== undefined) {
			this._bitmapCache.set(bitmapId, bitmap)

			// Companion counts each bitmap at its size as RGBA, which a raw rgb bitmap as base64 already matches.
			// Compressed bitmaps are much smaller, so report what they really cost to let more of them fit
			if (bitmap.startsWith('data:')) {
				this.sendMessage('BITMAP-COST', null, null, { BITMAP_ID: bitmapId, BYTES: bitmap.length })
			}
			return bitmap
		}

		const cached = this._bitmapCache.get(bitmapId)
		if (cached === undefined) this.emit('log', `KEY-STATE referenced unknown bitmap: ${bitmapId}`)
		return cached
	}

	private sendMessage(
		messageName: string,
		status: 'OK' | 'ERROR' | null,
		deviceId: string | null,
		args: SatelliteMessageArgs,
	): void {
		let message: string
		try {
			message = formatSatelliteMessage(messageName, status, deviceId, args)
		} catch (e) {
			// Reached from device events, so don't let a bad value escape into an emitter
			this.emit('log', `Failed to send ${messageName}: ${e instanceof Error ? e.message : e}`)
			return
		}
		this.socket?.write(message)
	}
}

/**
 * Calculate the size as RGBA of one bitmap for every control of a surface
 */
function calculateBitmapBytesPerFrame(manifest: SatelliteSurfaceLayout): number {
	let bytes = 0
	for (const control of Object.values(manifest.controls)) {
		const bitmap = manifest.stylePresets[control.stylePreset ?? 'default']?.bitmap
		if (bitmap) bytes += bitmap.w * bitmap.h * 4
	}
	return bytes
}
