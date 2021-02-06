import { EventEmitter } from 'eventemitter3'
import { Socket } from 'net'
import { Protocol, ProtocolHeader } from './protocol'

const SERVER_PORT = 37133
const PING_UNACKED_LIMIT = 5 // Arbitrary number
const PING_INTERVAL = 100
const RECONNECT_DELAY = 1000

export interface CompanionSatelliteClientOptions {
	debug?: boolean
}

export type CompanionSatelliteClientEvents = {
	error: [Error]
	log: [string]
	connected: []
	disconnected: []
	ipChange: [string]

	draw: [{ deviceId: number; keyIndex: number; image: Buffer }]
	brightness: [{ deviceId: number; percent: number }]
	newDevice: [{ serialNumber: string; deviceId: number }]
}

export class CompanionSatelliteClient extends EventEmitter<CompanionSatelliteClientEvents> {
	private readonly debug: boolean
	private socket: Socket | undefined

	private receiveBuffer: Buffer = Buffer.alloc(0)

	private _pingInterval: NodeJS.Timer | undefined
	private _pingUnackedCount = 0
	private _connected = false
	private _connectionActive = false // True when connected/connecting/reconnecting
	private _retryConnectTimeout: NodeJS.Timer | undefined = undefined
	private _host = ''

	public get host(): string {
		return this._host
	}

	constructor(options: CompanionSatelliteClientOptions = {}) {
		super()

		this.debug = !!options.debug

		this.initSocket()
	}

	private initSocket(): void {
		const socket = this.socket = new Socket()
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

			if (!this._pingInterval) {
				this._pingInterval = setInterval(() => this.sendPing(), PING_INTERVAL)
			}

			if (!this.socket) {
				// should never hit, but just in case
				this.disconnect()
				return
			}

			this.emit('log', 'sending version')
			const versionPkt = Protocol.SCMD_VERSION_PARSER.serialize({
				versionMajor: Protocol.SUPPORTED_MAJOR,
				versionMinior: Protocol.SUPPORTED_MINIOR,
			})
			Protocol.sendPacket(this.socket, Protocol.SCMD_VERSION, versionPkt)

			this.emit('connected')
		})

		if (this._host) {
			this.emit('log', `Connecting to ${this._host}:${SERVER_PORT}`)
			this.socket.connect(SERVER_PORT, this._host)
		}
	}

	private sendPing(): void {
		if (this._connected && this.socket) {
			if (this._pingUnackedCount > PING_UNACKED_LIMIT) {
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
			Protocol.sendPacket(this.socket, Protocol.SCMD_PING, undefined)
		}
	}

	public async connect(host: string): Promise<void> {
		if (this._connected || this._connectionActive) {
			await this.disconnect()
		}
		this._connectionActive = true

		setImmediate(() => {
			this.emit('ipChange', host)
		})

		this._host = host

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
		this.receiveBuffer = Buffer.concat([this.receiveBuffer, data])

		let ignoredBytes = 0
		
		while (this.receiveBuffer.length > 0) {
			const header = Protocol.readHeader(this.receiveBuffer)

			// not enough data
			if (header === false) {
				break
			}

			// out of sync
			if (header === -1) {
				ignoredBytes++
				// Try to find next start of packet
				this.receiveBuffer = this.receiveBuffer.slice(1)

				// Loop until it is found or we are out of buffer-data
				continue
			}

			if (ignoredBytes > 0) {
				console.debug(`Out of sync, skipped ${ignoredBytes} bytes of data`)
				ignoredBytes = 0
			}

			if (this.receiveBuffer.length < header.length + 6) {
				// not enough data yet
				break
			}

			this.parsePacket(header)
			this.receiveBuffer = this.receiveBuffer.slice(header.length + 6)
		}
	}

	private parsePacket(header: ProtocolHeader): void {
		const crc = Protocol.calcCRC(this.receiveBuffer.slice(5, 5 + header.length))

		if (crc != this.receiveBuffer[5 + header.length]) {
			console.debug('CRC Error in received packet')
			return
		}

		const packet = this.receiveBuffer.slice(5, 5 + header.length)

		switch (header.command) {
			case Protocol.SCMD_PONG:
				// console.log('Got pong')
				this._pingUnackedCount = 0
				break

			case Protocol.SCMD_VERSION: {
				const obj = Protocol.SCMD_VERSION_PARSER.parse(packet)
				console.log('Confirmed version', obj)
				break
			}

			case Protocol.SCMD_ADDDEVICE2: {
				const obj = Protocol.SCMD_ADDDEVICE2_PARSER.parse(packet)
				console.log('Confirmed device', obj)

				this.emit('newDevice', obj)
				break
			}

			case Protocol.SCMD_REMOVEDEVICE: {
				// TODO?
				// const obj = Protocol.SCMD_ADDDEVICE_PARSER.parse(packet)
				// console.log('Confirmed device', obj)

				// this.emit('newDevice', obj)
				break
			}

			case Protocol.SCMD_DRAW7272: {
				const obj = Protocol.SCMD_DRAW7272_PARSER.parse(packet)
				// console.log('Got draw', obj)
				this.emit('draw', obj)
				break
			}

			case Protocol.SCMD_BRIGHTNESS: {
				const obj = Protocol.SCMD_BRIGHTNESS_PARSER.parse(packet)
				console.log('Got brightness', obj)
				this.emit('brightness', obj)
				break
			}

			default:
				console.debug('Unknown command in packet: ' + header.command)
		}
	}

	public keyDown(deviceId: number, keyIndex: number): void {
		if (this._connected && this.socket) {
			const b = Protocol.SCMD_BUTTON_PARSER.serialize({ deviceId, keyIndex, state: 1 })
			Protocol.sendPacket(this.socket, Protocol.SCMD_BUTTON, b)
		}
	}
	public keyUp(deviceId: number, keyIndex: number): void {
		if (this._connected && this.socket) {
			const b = Protocol.SCMD_BUTTON_PARSER.serialize({ deviceId, keyIndex, state: 0 })
			Protocol.sendPacket(this.socket, Protocol.SCMD_BUTTON, b)
		}
	}

	public addDevice(serial: string, keysTotal: number, keysPerRow: number): void {
		if (this._connected && this.socket) {
			const addDev = Protocol.SCMD_ADDDEVICE2_PARSER.serialize({
				serialNumber: serial.padEnd(20, '\u0000'),
				deviceId: 0, // Specified by remote
				keysTotal,
				keysPerRow,
			})
			Protocol.sendPacket(this.socket, Protocol.SCMD_ADDDEVICE2, addDev)
		}
	}

	public removeDevice(deviceId: number): void {
		if (this._connected && this.socket) {
			const o = Protocol.SCMD_REMOVEDEVICE_PARSER.serialize({ deviceId })
			Protocol.sendPacket(this.socket, Protocol.SCMD_REMOVEDEVICE, o)
		}
	}
}
