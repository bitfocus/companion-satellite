import { EventEmitter } from 'eventemitter3'
import { Socket } from 'net'
import { DeviceDrawProps, DeviceRegisterProps } from './device-types/api'
import { DEFAULT_PORT } from './lib'
import * as semver from 'semver'

const PING_UNACKED_LIMIT = 5 // Arbitrary number
const PING_IDLE_TIMEOUT = 500 // Pings are allowed to be late if another packet has been received recently
const PING_INTERVAL = 100
const RECONNECT_DELAY = 1000

function parseLineParameters(line: string): Record<string, string | boolean> {
	const makeSafe = (index: number): number => {
		return index === -1 ? Number.POSITIVE_INFINITY : index
	}

	let fragments: string[] = ['']
	let quotes = 0

	let i = 0
	while (i < line.length) {
		// Find the next characters of interest
		const spaceIndex = makeSafe(line.indexOf(' ', i))
		const slashIndex = makeSafe(line.indexOf('\\', i))
		const quoteIndex = makeSafe(line.indexOf('"', i))

		// Find which is closest
		let o = Math.min(spaceIndex, slashIndex, quoteIndex)
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
	disconnected: []
	ipChange: [string]

	draw: [DeviceDrawProps]
	brightness: [{ deviceId: string; percent: number }]
	newDevice: [{ deviceId: string }]
	clearDeck: [{ deviceId: string }]
	deviceErrored: [{ deviceId: string; message: string }]
}

export class CompanionSatelliteClient extends EventEmitter<CompanionSatelliteClientEvents> {
	private readonly debug: boolean
	private socket: Socket | undefined

	private receiveBuffer = ''

	private _pingInterval: NodeJS.Timer | undefined
	private _pingUnackedCount = 0
	private _lastReceivedAt = 0
	private _connected = false
	private _connectionActive = false // True when connected/connecting/reconnecting
	private _retryConnectTimeout: NodeJS.Timer | undefined = undefined
	private _host = ''
	private _port = DEFAULT_PORT
	private _supportsCombinedEncoders = false
	private _supportsBitmapResolution = false

	public forceSplitEncoders = false

	public get host(): string {
		return this._host
	}
	public get port(): number {
		return this._port
	}

	/**
	 * Until 2.4 of Companion it does not support rotary encoders.
	 * For these, we can 'simulate' them by use the press/release actions of a button.
	 */
	public get useCombinedEncoders(): boolean {
		return !this.forceSplitEncoders && this._supportsCombinedEncoders
	}

	/**
	 * Until 3.x of Companion it only supports providing 72x72px bitmaps for buttons.
	 */
	public get useCustomBitmapResolution(): boolean {
		return this._supportsBitmapResolution
	}

	constructor(options: CompanionSatelliteClientOptions = {}) {
		super()

		this.debug = !!options.debug

		this.initSocket()
	}

	private initSocket(): void {
		const socket = (this.socket = new Socket())
		this.socket.on('error', (e) => {
			this.emit('error', e)
		})
		this.socket.on('close', () => {
			if (this.debug) {
				this.emit('log', 'Connection closed')
			}

			if (this._connected) {
				this.emit('disconnected')
			}
			this._connected = false
			this.receiveBuffer = ''

			if (this._pingInterval) {
				clearInterval(this._pingInterval)
				this._pingInterval = undefined
			}

			if (!this._retryConnectTimeout && this.socket === socket) {
				this._retryConnectTimeout = setTimeout(() => {
					this._retryConnectTimeout = undefined
					this.emit('log', 'Trying reconnect')
					this.initSocket()
				}, RECONNECT_DELAY)
			}
		})

		this.socket.on('data', (d) => this._handleReceivedData(d))

		this.socket.on('connect', () => {
			if (this.debug) {
				this.emit('log', 'Connected')
			}

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

			this.emit('connected')
		})

		if (this._host) {
			this.emit('log', `Connecting to ${this._host}:${this._port}`)
			this.socket.connect(this._port, this._host)
		}
	}

	private sendPing(): void {
		if (this._connected && this.socket) {
			if (this._pingUnackedCount > PING_UNACKED_LIMIT && this._lastReceivedAt <= Date.now() - PING_IDLE_TIMEOUT) {
				// Ping was never acked, so it looks like a timeout
				this.emit('log', 'ping timeout')
				try {
					this.socket.destroy()
				} catch (e) {
					// ignore
				}
				return
			}

			this._pingUnackedCount++
			this.socket.write('PING\n')
		}
	}

	public async connect(host: string, port: number): Promise<void> {
		if (this._connected || this._connectionActive) {
			await this.disconnect()
		}
		this._connectionActive = true

		setImmediate(() => {
			this.emit('ipChange', host)
		})

		this._host = host
		this._port = port

		this.initSocket()
	}

	public disconnect(): Promise<void> {
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
			return Promise.resolve()
		}

		return new Promise((resolve, reject) => {
			try {
				this.socket?.end()
				this.socket = undefined
				return resolve()
			} catch (e) {
				this.socket = undefined
				return reject(e)
			}
		})
	}

	private _handleReceivedData(data: Buffer): void {
		this._lastReceivedAt = Date.now()
		this.receiveBuffer += data.toString()

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
				// Ignore
				break
			default:
				console.log(`Received unhandled command: ${cmd} ${body}`)
				break
		}
	}

	private handleBegin(params: Record<string, string | boolean>): void {
		const protocolVersion = params.ApiVersion
		if (typeof protocolVersion === 'string') {
			if (semver.lte('1.3.0', protocolVersion)) {
				this._supportsCombinedEncoders = true
				console.log('Companion supports combined encoders')
			}
			if (semver.lte('1.5.0', protocolVersion)) {
				this._supportsBitmapResolution = true
				console.log('Companion supports bitmap resolution')
			}
		}
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

		this.emit('newDevice', { deviceId: params.DEVICEID })
	}

	public keyDown(deviceId: string, keyIndex: number): void {
		if (this._connected && this.socket) {
			this.socket.write(`KEY-PRESS DEVICEID=${deviceId} KEY=${keyIndex} PRESSED=1\n`)
		}
	}
	public keyUp(deviceId: string, keyIndex: number): void {
		if (this._connected && this.socket) {
			this.socket.write(`KEY-PRESS DEVICEID=${deviceId} KEY=${keyIndex} PRESSED=0\n`)
		}
	}
	public rotateLeft(deviceId: string, keyIndex: number): void {
		if (this._connected && this.socket) {
			this.socket.write(`KEY-ROTATE DEVICEID=${deviceId} KEY=${keyIndex} DIRECTION=0\n`)
		}
	}
	public rotateRight(deviceId: string, keyIndex: number): void {
		if (this._connected && this.socket) {
			this.socket.write(`KEY-ROTATE DEVICEID=${deviceId} KEY=${keyIndex} DIRECTION=1\n`)
		}
	}

	public addDevice(deviceId: string, productName: string, props: DeviceRegisterProps): void {
		if (this._connected && this.socket) {
			this.socket.write(
				`ADD-DEVICE DEVICEID=${deviceId} PRODUCT_NAME="${productName}" KEYS_TOTAL=${
					props.keysTotal
				} KEYS_PER_ROW=${props.keysPerRow} BITMAPS=${
					this._supportsBitmapResolution ? props.bitmapSize ?? 0 : props.bitmapSize ? 1 : 0
				} COLORS=${props.colours ? 1 : 0} TEXT=${props.text ? 1 : 0}\n`
			)
		}
	}

	public removeDevice(deviceId: string): void {
		if (this._connected && this.socket) {
			this.socket.write(`REMOVE-DEVICE DEVICEID=${deviceId}\n`)
		}
	}
}
