import { EventEmitter } from 'eventemitter3'
import { Socket } from 'net'
import { Protocol, ProtocolHeader } from './protocol'

const SERVER_PORT = 37133

export interface CompanionSatelliteClientOptions {
	debug?: boolean
}

export type CompanionSatelliteClientEvents = {
	error: [Error]
	log: [string]
	connected: []
	disconnected: []

	draw: [{ deviceId: number; keyIndex: number; image: Buffer }]
	brightness: [{ deviceId: number; percent: number }]
	newDevice: [{ serialNumber: string; deviceId: number }]
}

export class CompanionSatelliteClient extends EventEmitter<CompanionSatelliteClientEvents> {
	private readonly debug: boolean
	private readonly socket: Socket

	private receiveBuffer: Buffer = Buffer.alloc(0)

	private _pingInterval: NodeJS.Timer | undefined
	private _connected = false
	private _connectionActive = false // True when connected/connecting/reconnecting
	private _retryConnectTimeout: NodeJS.Timer | undefined = undefined
	private _host = ''

	constructor(options: CompanionSatelliteClientOptions = {}) {
		super()

		this.debug = !!options.debug

		this.socket = new Socket()
		this.socket.on('error', (e) => this.emit('error', e))
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

			if (!this._retryConnectTimeout) {
				this._retryConnectTimeout = setTimeout(() => {
					this.emit('log', 'Trying reconnect')
					this.socket.connect(SERVER_PORT, this._host)
				}, 1000)
			}
		})

		this.socket.on('data', (d) => this._handleReceivedData(d))

		this.socket.on('connect', () => {
			if (this.debug) {
				this.emit('log', 'Connected')
			}

			this._connected = true

			if (!this._pingInterval) {
				this._pingInterval = setInterval(() => this.sendPing(), 100)
			}

			this.emit('log', 'sending version')
			const versionPkt = Protocol.SCMD_VERSION_PARSER.serialize({
				versionMajor: Protocol.SUPPORTED_MAJOR,
				versionMinior: Protocol.SUPPORTED_MINIOR,
			})
			Protocol.sendPacket(this.socket, Protocol.SCMD_VERSION, versionPkt)

			this.emit('connected')
		})
	}

	private sendPing(): void {
		Protocol.sendPacket(this.socket, Protocol.SCMD_PING, undefined)
	}

	public connect(host: string): void {
		if (this._connected || this._connectionActive) {
			return
		}
		this._connectionActive = true

		this._host = host
		this.socket.connect(SERVER_PORT, this._host)
	}

	public disconnect(): Promise<void> {
		this._connectionActive = false
		if (this._retryConnectTimeout) {
			clearTimeout(this._retryConnectTimeout)
			delete this._retryConnectTimeout
		}

		if (!this._connected) {
			return Promise.resolve()
		}

		return new Promise((resolve, reject) => {
			try {
				// await this.sendCommand(new QuitCommand())
				this.socket.end()
				return resolve()
			} catch (e) {
				return reject(e)
			}
		})
	}

	private _handleReceivedData(data: Buffer): void {
		this.receiveBuffer = Buffer.concat([this.receiveBuffer, data])
		this.findPackets()
	}

	private findPackets(): void {
		const header = Protocol.readHeader(this.receiveBuffer)

		// not enough data
		if (header === false) {
			return
		}

		// out of sync
		if (header === -1) {
			console.debug('Out of sync, trying to find next valid packet')
			// Try to find next start of packet
			this.receiveBuffer = this.receiveBuffer.slice(1)

			// Loop until it is found or we are out of buffer-data
			this.findPackets()
			return
		}

		if (header.length + 6 <= this.receiveBuffer.length) {
			this.parsePacket(header)
			this.receiveBuffer = this.receiveBuffer.slice(header.length + 6)

			this.findPackets()
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
			// case Protocol.SCMD_PING:
			// 	Protocol.sendPacket(this.socket, Protocol.SCMD_PONG, undefined)
			// 	break
			case Protocol.SCMD_PONG:
				console.log('Got pong')
				// TODO - track and timeouts etc
				break

			case Protocol.SCMD_VERSION:
				this.handleVersion(packet)
				break

			case Protocol.SCMD_ADDDEVICE:
				this.newDevice(packet)
				break

			case Protocol.SCMD_DRAW7272:
				this.draw(packet)
				break

			case Protocol.SCMD_BRIGHTNESS:
				this.brightness(packet)
				break

			default:
				console.debug('Unknown command in packet: ' + header.command)
		}
	}

	private handleVersion(packet: Buffer): void {
		const obj = Protocol.SCMD_VERSION_PARSER.parse(packet)
		console.log('Confirmed version', obj)

		// Next step

		// const addDev = Protocol.SCMD_ADDDEVICE_PARSER.serialize({
		// 	serialNumber: 'abcdef',
		// 	deviceId: 0, // Specified by remote
		// })
		// Protocol.sendPacket(this.socket, Protocol.SCMD_ADDDEVICE, addDev)
	}

	private newDevice(packet: Buffer): void {
		const obj = Protocol.SCMD_ADDDEVICE_PARSER.parse(packet)
		console.log('Confirmed device', obj)

		this.emit('newDevice', obj)

		// Next step

		// const addDev = Protocol.SCMD_ADDDEVICE_PARSER.serialize({
		// 	serialNumber: 'abcdef',
		// 	deviceId: 1234,
		// })
		// Protocol.sendPacket(this.socket, Protocol.SCMD_ADDDEVICE, addDev)
	}

	private draw(packet: Buffer): void {
		const obj = Protocol.SCMD_DRAW7272_PARSER.parse(packet)
		// console.log('Got draw', obj)
		this.emit('draw', obj)
	}

	private brightness(packet: Buffer): void {
		const obj = Protocol.SCMD_BRIGHTNESS_PARSER.parse(packet)
		console.log('Got brightness', obj)
		this.emit('brightness', obj)
	}

	public keyDown(deviceId: number, keyIndex: number): void {
		const b = Protocol.SCMD_BUTTON_PARSER.serialize({ deviceId, keyIndex, state: 1 })
		Protocol.sendPacket(this.socket, Protocol.SCMD_BUTTON, b)
	}
	public keyUp(deviceId: number, keyIndex: number): void {
		const b = Protocol.SCMD_BUTTON_PARSER.serialize({ deviceId, keyIndex, state: 0 })
		Protocol.sendPacket(this.socket, Protocol.SCMD_BUTTON, b)
	}

	public addDevice(serial: string): void {
		const addDev = Protocol.SCMD_ADDDEVICE_PARSER.serialize({
			serialNumber: serial,
			deviceId: 0, // Specified by remote
		})
		Protocol.sendPacket(this.socket, Protocol.SCMD_ADDDEVICE, addDev)
	}
}
