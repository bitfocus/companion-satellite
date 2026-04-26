import { EventEmitter } from 'events'
import { assertNever, Complete, DEFAULT_TCP_PORT } from '../lib.js'
import * as semver from 'semver'
import {
	CompanionSatelliteTcpClient,
	CompanionSatelliteWsClient,
	formatConnectionUrl,
	ICompanionSatelliteClient,
	ICompanionSatelliteClientOptions,
	SomeConnectionDetails,
} from './socketImplementations.js'
import { SatelliteControlDefinition, SatelliteSurfaceLayout } from '../generated/SurfaceManifestSchema.js'
import { SatelliteConfigFields } from '../generated/SatelliteConfigFieldsSchema.js'
import { parseLineParameters } from './parser.js'
import type { GridSize } from '@companion-surface/base'

const PING_UNACKED_LIMIT = 15 // Arbitrary number
const PING_IDLE_TIMEOUT = 1000 // Pings are allowed to be late if another packet has been received recently
const PING_INTERVAL = 100
const RECONNECT_DELAY = 1000
const RECONNECT_DELAY_UNSUPPORTED = 30000

const MINIMUM_PROTOCOL_VERSION = '1.7.0' // Companion 3.4

export interface CompanionSatelliteClientOptions {
	debug?: boolean
}

export interface CompanionSatelliteClientDrawProps {
	deviceId: string
	keyIndex: number | undefined
	controlId: string | undefined
	image?: string // base64
	color?: string // hex
	textColor?: string // hex
	text?: string
	fontSize?: number
	type?: string
	pressed?: boolean
	location?: string
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
	variableValue: [{ deviceId: string; name: string; value: string }]
	lockedState: [{ deviceId: string; locked: boolean; characterCount: number }]
	deviceErrored: [{ deviceId: string; message: string }]
	deviceConfig: [{ deviceId: string; config: Record<string, unknown> }]
}

export class CompanionSatelliteClient extends EventEmitter<CompanionSatelliteClientEvents> {
	private readonly debug: boolean
	private socket: ICompanionSatelliteClient | undefined

	private receiveBuffer = ''

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
	private _pendingConnected = false
	private _capsTimer: NodeJS.Timeout | undefined = undefined

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
				this._pendingConnected = false
				if (this._capsTimer) {
					clearTimeout(this._capsTimer)
					this._capsTimer = undefined
				}

				if (this._connected) {
					this.emit('disconnected')
				} else {
					this._companionUnsupported = false
				}
				this._connected = false
				this.receiveBuffer = ''

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
				this._pingUnackedCount = 0
				this.receiveBuffer = ''

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
		this.receiveBuffer += data

		let i: number
		let offset = 0
		while ((i = this.receiveBuffer.indexOf('\n', offset)) !== -1) {
			let line = this.receiveBuffer.substring(offset, i)
			if (line.endsWith('\r')) line = line.substring(0, line.length - 1)

			offset = i + 1
			this.handleCommand(line)
		}
		this.receiveBuffer = this.receiveBuffer.substring(offset)
	}

	private handleCommand(line: string): void {
		const i = line.indexOf(' ')
		const cmd = i === -1 ? line : line.slice(0, i)
		const body = i === -1 ? '' : line.slice(i + 1)
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

	private handleBegin(params: Record<string, string | boolean>): void {
		this._companionVersion = typeof params.CompanionVersion === 'string' ? params.CompanionVersion : null
		this._companionApiVersion = typeof params.ApiVersion === 'string' ? params.ApiVersion : null

		// Check if the companion is supported
		this._companionUnsupported =
			!this._companionApiVersion || semver.lt(this._companionApiVersion, MINIMUM_PROTOCOL_VERSION)
		if (this._companionUnsupported) {
			this.emit(
				'log',
				`Connected to unsupported Companion version. Companion ${this._companionVersion}, API ${this._companionApiVersion}`,
			)
			this.socket?.end()
			return
		}

		// Perform api version checks
		this._supportsLocalLockState = !!this._companionApiVersion && semver.lte('1.8.0', this._companionApiVersion)
		if (this._supportsLocalLockState) {
			this.emit('log', 'Companion supports delegating locking drawing')
		}
		this._supportsSurfaceManifest = !!this._companionApiVersion && semver.lte('1.9.0', this._companionApiVersion)
		if (this._supportsSurfaceManifest) {
			this.emit('log', 'Companion supports surface manifest')
		}
		this._supportsDeviceSerial = !!this._companionApiVersion && semver.lte('1.10.0', this._companionApiVersion)
		if (this._supportsDeviceSerial) {
			this.emit('log', 'Companion supports separate serial value')
		}
		this._supportsNonSquareBitmaps = false
		this._supportsSubscriptions = false

		// Defer emitting connected until CAPS is received (added in API 1.10.0)
		this._pendingConnected = true
		if (this._capsTimer) clearTimeout(this._capsTimer)

		const expectCaps = !!this._companionApiVersion && semver.lte('1.10.0', this._companionApiVersion)
		if (expectCaps) {
			// Defensive fallback: if CAPS never arrives, complete connection after 500ms
			this._capsTimer = setTimeout(() => {
				this._capsTimer = undefined
				this.emit('log', 'CAPS not received within timeout, completing connection without capabilities')
				this.completeConnection()
			}, 500)
		} else {
			// Older Companion versions don't send CAPS, complete immediately
			this.completeConnection()
		}
	}

	private handleState(params: Record<string, string | boolean>): void {
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

		const image = typeof params.BITMAP === 'string' ? params.BITMAP : undefined
		const text = typeof params.TEXT === 'string' ? Buffer.from(params.TEXT, 'base64').toString() : undefined
		const color = typeof params.COLOR === 'string' ? params.COLOR : undefined
		const textColor = typeof params.TEXTCOLOR === 'string' ? params.TEXTCOLOR : undefined
		const fontSize = typeof params.FONT_SIZE === 'string' ? parseInt(params.FONT_SIZE) : undefined
		const type = typeof params.TYPE === 'string' ? params.TYPE : undefined
		const pressed = typeof params.PRESSED === 'string' ? params.PRESSED === '1' : undefined
		const location = typeof params.LOCATION === 'string' ? params.LOCATION : undefined

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
		} satisfies Complete<CompanionSatelliteClientDrawProps>)
	}
	private handleClear(params: Record<string, string | boolean>): void {
		if (typeof params.DEVICEID !== 'string') {
			this.emit('log', 'Mising DEVICEID in KEYS-CLEAR response')
			return
		}

		this.emit('clearDeck', { deviceId: params.DEVICEID })
	}
	private handleVariableValue(params: Record<string, string | boolean>) {
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

		this.emit('variableValue', {
			deviceId: params.DEVICEID,
			name: params.VARIABLE,
			value: Buffer.from(params.VALUE, 'base64').toString(),
		})
	}

	private handleLockedState(params: Record<string, string | boolean>) {
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

		this.emit('lockedState', {
			deviceId: params.DEVICEID,
			locked: params.LOCKED === '1',
			characterCount: Number(params.CHARACTER_COUNT),
		})
	}

	private handleBrightness(params: Record<string, string | boolean>): void {
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

	private handleAddedDevice(params: Record<string, string | boolean>): void {
		if (!params.OK || params.ERROR) {
			this.emit('log', `Add device failed: ${JSON.stringify(params)}`)
			if (typeof params.DEVICEID === 'string') {
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

	private handleCaps(params: Record<string, string | boolean>): void {
		if (this._capsTimer) {
			clearTimeout(this._capsTimer)
			this._capsTimer = undefined
		}

		this._supportsSubscriptions = params.SUBSCRIPTIONS === '1' || params.SUBSCRIPTIONS === true
		if (this._supportsSubscriptions) {
			this.emit('log', 'Companion supports button subscriptions')
		}
		this._supportsNonSquareBitmaps = params.NONSQUARE === '1' || params.NONSQUARE === true
		if (this._supportsNonSquareBitmaps) {
			this.emit('log', 'Companion supports non-square bitmaps')
		}

		this.completeConnection()
	}

	private completeConnection(): void {
		if (!this._pendingConnected) return
		this._pendingConnected = false
		setImmediate(() => {
			this.emit('connected')
		})
	}

	private handleDeviceConfig(params: Record<string, string | boolean>): void {
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
	public rotateLeft(deviceId: string, controlId: string, controlDefinition: SatelliteControlDefinition): void {
		if (this._connected && this.socket) {
			this.sendMessage('KEY-ROTATE', null, deviceId, {
				CONTROLID: controlId,
				KEY: `${controlDefinition.row}/${controlDefinition.column}`,
				DIRECTION: false,
			})
		}
	}
	public rotateRight(deviceId: string, controlId: string, controlDefinition: SatelliteControlDefinition): void {
		if (this._connected && this.socket) {
			this.sendMessage('KEY-ROTATE', null, deviceId, {
				CONTROLID: controlId,
				KEY: `${controlDefinition.row}/${controlDefinition.column}`,
				DIRECTION: true,
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
	public sendVariableValue(deviceId: string, variable: string, value: string): void {
		if (this._connected && this.socket) {
			this.sendMessage('SET-VARIABLE-VALUE', null, deviceId, {
				VARIABLE: variable,
				VALUE: Buffer.from(value).toString('base64'),
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

		if (this._connected && this.socket) {
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
				// PINCODE_LOCK: props.pincodeMap ? 'FULL' : '', // nocommit - verify
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

				this.sendMessage('ADD-DEVICE', null, deviceId, {
					LAYOUT_MANIFEST: Buffer.from(JSON.stringify(props.surfaceManifest)).toString('base64'),
					...commonProps,
					...serialArgs,
					...configFieldsArgs,
					...canChangePageArgs,
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

			this.sendMessage('REMOVE-DEVICE', null, deviceId, {})
		}
	}

	private sendMessage(
		messageName: string,
		status: 'OK' | 'ERROR' | null,
		deviceId: string | null,
		args: SatelliteMessageArgs,
	): void {
		const chunks: string[] = [messageName]
		if (status) chunks.push(status)
		if (deviceId) chunks.push(`DEVICEID="${deviceId}"`)

		for (const [key, value] of Object.entries(args)) {
			let valueStr: string
			if (typeof value === 'boolean') {
				valueStr = value ? '1' : '0'
			} else if (typeof value === 'number') {
				valueStr = value.toString()
			} else {
				valueStr = `"${value}"`
			}
			chunks.push(`${key}=${valueStr}`)
		}

		chunks.push('\n')
		this.socket?.write(chunks.join(' '))
	}
}

type SatelliteMessageArgs = Record<string, string | number | boolean>
