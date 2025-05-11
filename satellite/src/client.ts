import { EventEmitter } from 'events'
import { ClientCapabilities, CompanionClient, DeviceRegisterProps } from './device-types/api.js'
import { assertNever, DEFAULT_TCP_PORT } from './lib.js'
import * as semver from 'semver'
import {
	CompanionSatelliteTcpClient,
	CompanionSatelliteWsClient,
	formatConnectionUrl,
	ICompanionSatelliteClient,
	ICompanionSatelliteClientOptions,
	SomeConnectionDetails,
} from './clientImplementations.js'
import { SurfaceProxyDrawProps } from './surfaceProxy.js'

const PING_UNACKED_LIMIT = 15 // Arbitrary number
const PING_IDLE_TIMEOUT = 1000 // Pings are allowed to be late if another packet has been received recently
const PING_INTERVAL = 100
const RECONNECT_DELAY = 1000
const RECONNECT_DELAY_UNSUPPORTED = 30000

const MINIMUM_PROTOCOL_VERSION = '1.7.0' // Companion 3.4

function parseLineParameters(line: string): Record<string, string | boolean> {
	const makeSafe = (index: number): number => {
		return index === -1 ? Number.POSITIVE_INFINITY : index
	}

	const fragments: string[] = ['']
	let quotes = 0

	let i = 0
	while (i < line.length) {
		// Find the next characters of interest
		const spaceIndex = makeSafe(line.indexOf(' ', i))
		const slashIndex = makeSafe(line.indexOf('\\', i))
		const quoteIndex = makeSafe(line.indexOf('"', i))

		// Find which is closest
		const o = Math.min(spaceIndex, slashIndex, quoteIndex)
		if (!isFinite(o)) {
			// None were found, copy the remainder and stop
			const slice = line.substring(i)
			fragments[fragments.length - 1] += slice

			break
		} else {
			// copy the slice before this character
			const slice = line.substring(i, o)
			fragments[fragments.length - 1] += slice

			const c = line[o]
			if (c == '\\') {
				// If char is a slash, the character following it is of interest
				// Future: does this consider non \" chars?
				fragments[fragments.length - 1] += line[o + 1]

				i = o + 2
			} else {
				i = o + 1

				// Figure out what the char was
				if (c === '"') {
					quotes ^= 1
				} else if (!quotes && c === ' ') {
					fragments.push('')
				} else {
					fragments[fragments.length - 1] += c
				}
			}
		}
	}

	const res: Record<string, string | boolean> = {}

	for (const fragment of fragments) {
		const [key, value] = fragment.split('=', 2)
		res[key] = value === undefined ? true : value
	}

	return res
}

export interface CompanionSatelliteClientOptions {
	debug?: boolean
}

export type CompanionSatelliteClientEvents = {
	error: [Error]
	log: [string]
	connected: []
	connecting: []
	disconnected: []

	draw: [SurfaceProxyDrawProps]
	brightness: [{ deviceId: string; percent: number }]
	newDevice: [{ deviceId: string }]
	clearDeck: [{ deviceId: string }]
	variableValue: [{ deviceId: string; name: string; value: string }]
	lockedState: [{ deviceId: string; locked: boolean; characterCount: number }]
	deviceErrored: [{ deviceId: string; message: string }]
}

export class CompanionSatelliteClient extends EventEmitter<CompanionSatelliteClientEvents> implements CompanionClient {
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
			// For future use
		}
	}

	constructor(options: CompanionSatelliteClientOptions = {}) {
		super()

		this.debug = !!options.debug

		this.initSocket()
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

		let i = -1
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
				// console.log('Got pong')
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
				console.log(`Removed device: ${body}`)
				break
			case 'BEGIN':
				console.log(`Connected to Companion: ${body}`)
				this.handleBegin(params)
				break
			case 'KEY-PRESS':
			case 'KEY-ROTATE':
			case 'SET-VARIABLE-VALUE':
			case 'PINCODE-KEY':
				// Ignore
				break
			default:
				console.log(`Received unhandled command: ${cmd} ${body}`)
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
			console.log(
				`Connected to unsupported Companion version. Companion ${this._companionVersion}, API ${this._companionApiVersion}`,
			)
			this.socket?.end()
			return
		}

		// Revive for future checks
		// const protocolVersion = params.ApiVersion
		// if (typeof protocolVersion === 'string') {
		// 	if (semver.lte('1.3.0', protocolVersion)) {
		// 		this._supportsCombinedEncoders = true
		// 		console.log('Companion supports combined encoders')
		// 	}
		if (this._companionApiVersion && semver.lte('1.8.0', this._companionApiVersion)) {
			this._supportsLocalLockState = true
			console.log('Companion supports delegating locking drawing')
		}
		// }

		// report the connection as ready
		setImmediate(() => {
			this.emit('connected')
		})
	}

	private handleState(params: Record<string, string | boolean>): void {
		if (typeof params.DEVICEID !== 'string') {
			console.log('Missing DEVICEID in KEY-DRAW response')
			return
		}
		if (typeof params.KEY !== 'string') {
			console.log('Missing KEY in KEY-DRAW response')
			return
		}

		const keyIndex = parseInt(params.KEY)
		if (isNaN(keyIndex)) {
			console.log('Bad KEY in KEY-DRAW response')
			return
		}

		const image = typeof params.BITMAP === 'string' ? Buffer.from(params.BITMAP, 'base64') : undefined
		const text = typeof params.TEXT === 'string' ? Buffer.from(params.TEXT, 'base64').toString() : undefined
		const color = typeof params.COLOR === 'string' ? params.COLOR : undefined

		this.emit('draw', { deviceId: params.DEVICEID, keyIndex, image, text, color })
	}
	private handleClear(params: Record<string, string | boolean>): void {
		if (typeof params.DEVICEID !== 'string') {
			console.log('Mising DEVICEID in KEYS-CLEAR response')
			return
		}

		this.emit('clearDeck', { deviceId: params.DEVICEID })
	}
	private handleVariableValue(params: Record<string, string | boolean>) {
		if (typeof params.DEVICEID !== 'string') {
			console.log('Mising DEVICEID in VARIABLE-VALUE response')
			return
		}
		if (typeof params.VARIABLE !== 'string') {
			console.log('Missing VARIABLE in VARIABLE-VALUE response')
			return
		}
		if (typeof params.VALUE !== 'string') {
			console.log('Missing VALUE in VARIABLE-VALUE response')
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
			console.log('Mising DEVICEID in LOCKED-STATE response')
			return
		}
		if (typeof params.LOCKED !== 'string') {
			console.log('Missing LOCKED in LOCKED-STATE response')
			return
		}
		if (typeof params.CHARACTER_COUNT !== 'string') {
			console.log('Missing CHARACTER_COUNT in LOCKED-STATE response')
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
			console.log('Missing DEVICEID in BRIGHTNESS response')
			return
		}
		if (typeof params.VALUE !== 'string') {
			console.log('Missing VALUE in BRIGHTNESS response')
			return
		}
		const percent = parseInt(params.VALUE)
		if (isNaN(percent)) {
			console.log('Bad VALUE in BRIGHTNESS response')
			return
		}
		this.emit('brightness', { deviceId: params.DEVICEID, percent })
	}

	private handleAddedDevice(params: Record<string, string | boolean>): void {
		if (!params.OK || params.ERROR) {
			console.log(`Add device failed: ${JSON.stringify(params)}`)
			if (typeof params.DEVICEID === 'string') {
				this.emit('deviceErrored', {
					deviceId: params.DEVICEID,
					message: `${params.MESSAGE || 'Unknown Error'}`,
				})
			}
			return
		}
		if (typeof params.DEVICEID !== 'string') {
			console.log('Missing DEVICEID in ADD-DEVICE response')
			return
		}

		this._registeredDevices.add(params.DEVICEID)
		this._pendingDevices.delete(params.DEVICEID)

		this.emit('newDevice', { deviceId: params.DEVICEID })
	}

	public keyDownXY(deviceId: string, x: number, y: number): void {
		if (this._connected && this.socket) {
			this.sendMessage('KEY-PRESS', null, deviceId, {
				KEY: `${y}/${x}`,
				PRESSED: true,
			})
		}
	}
	public keyUpXY(deviceId: string, x: number, y: number): void {
		if (this._connected && this.socket) {
			this.sendMessage('KEY-PRESS', null, deviceId, {
				KEY: `${y}/${x}`,
				PRESSED: false,
			})
		}
	}
	public rotateLeftXY(deviceId: string, x: number, y: number): void {
		if (this._connected && this.socket) {
			this.sendMessage('KEY-ROTATE', null, deviceId, {
				KEY: `${y}/${x}`,
				DIRECTION: false,
			})
		}
	}
	public rotateRightXY(deviceId: string, x: number, y: number): void {
		if (this._connected && this.socket) {
			this.sendMessage('KEY-ROTATE', null, deviceId, {
				KEY: `${y}/${x}`,
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

	public addDevice(deviceId: string, productName: string, props: DeviceRegisterProps): void {
		if (this._registeredDevices.has(deviceId)) {
			throw new Error('Device is already registered')
		}

		const pendingTime = this._pendingDevices.get(deviceId)
		if (pendingTime && pendingTime < Date.now() - 10000) {
			throw new Error('Device is already being added')
		}

		if (this._connected && this.socket) {
			this._pendingDevices.set(deviceId, Date.now())

			const transferVariables = Buffer.from(JSON.stringify(props.transferVariables ?? [])).toString('base64')

			this.sendMessage('ADD-DEVICE', null, deviceId, {
				PRODUCT_NAME: productName,
				KEYS_TOTAL: props.columnCount * props.rowCount,
				KEYS_PER_ROW: props.columnCount,
				BITMAPS: props.bitmapSize ?? 0,
				COLORS: props.colours,
				TEXT: props.text,
				VARIABLES: transferVariables,
				BRIGHTNESS: props.brightness,
				PINCODE_LOCK: props.pincodeMode ? 'FULL' : '',
			})
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
