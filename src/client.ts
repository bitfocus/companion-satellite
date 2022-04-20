import EE3 from 'eventemitter3'
import { Socket } from 'net'
import { DeviceDrawProps, DeviceRegisterProps } from './device-types/api.js'
import { DEFAULT_PORT } from './lib.js'

const PING_UNACKED_LIMIT = 5 // Arbitrary number
const PING_IDLE_TIMEOUT = 500 // Pings are allowed to be late if another packet has been received recently
const PING_INTERVAL = 100
const RECONNECT_DELAY = 1000

function parseLineParameters(line: string): Record<string, string | boolean> {
	// https://newbedev.com/javascript-split-string-by-space-but-ignore-space-in-quotes-notice-not-to-split-by-the-colon-too
	const match = line.match(/\\?.|^$/g)
	const fragments = match
		? match.reduce(
				(p, c) => {
					if (c === '"') {
						p.quote ^= 1
					} else if (!p.quote && c === ' ') {
						p.a.push('')
					} else {
						p.a[p.a.length - 1] += c.replace(/\\(.)/, '$1')
					}
					return p
				},
				{ a: [''], quote: 0 }
		  ).a
		: []

	const res: Record<string, string | boolean> = {}

	for (const fragment of fragments) {
		const [key, value] = fragment.split('=')
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

export class CompanionSatelliteClient extends EE3.EventEmitter<CompanionSatelliteClientEvents> {
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

	public get host(): string {
		return this._host
	}
	public get port(): number {
		return this._port
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
			const line = this.receiveBuffer.substring(offset, i)
			offset = i + 1
			this.handleCommand(line.toString().replace(/\r/, ''))
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
				console.log('Removed device: ${body}')
				break
			case 'BEGIN':
				console.log(`Connected to Companion: ${body}`)
				break
			case 'KEY-PRESS':
				// Ignore
				break
			default:
				console.log(`Received unhandled command: ${cmd} ${body}`)
				break
		}
	}

	private handleState(params: Record<string, string | boolean>): void {
		if (typeof params.DEVICEID !== 'string') {
			console.log('Mising DEVICEID in KEY-DRAW response')
			return
		}
		if (typeof params.KEY !== 'string') {
			console.log('Mising KEY in KEY-DRAW response')
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
			console.log('Mising DEVICEID in BRIGHTNESS response')
			return
		}
		if (typeof params.VALUE !== 'string') {
			console.log('Mising VALUE in BRIGHTNESS response')
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
			console.log('Mising DEVICEID in ADD-DEVICE response')
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

	public addDevice(deviceId: string, productName: string, props: DeviceRegisterProps): void {
		if (this._connected && this.socket) {
			this.socket.write(
				`ADD-DEVICE DEVICEID=${deviceId} PRODUCT_NAME="${productName}" KEYS_TOTAL=${
					props.keysTotal
				} KEYS_PER_ROW=${props.keysPerRow} BITMAPS=${props.bitmaps ? 1 : 0} COLORS=${
					props.colours ? 1 : 0
				} TEXT=${props.text ? 1 : 0}\n`
			)
		}
	}

	public removeDevice(deviceId: string): void {
		if (this._connected && this.socket) {
			this.socket.write(`REMOVE-DEVICE DEVICEID=${deviceId}\n`)
		}
	}
}
