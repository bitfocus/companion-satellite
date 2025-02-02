import { Socket } from 'net'
import { WebSocket } from 'ws'

export interface ICompanionSatelliteClientEvents {
	error: [Error]
	close: []
	data: [Buffer]
	connect: []
}

export interface ICompanionSatelliteClientOptions {
	onError: (error: Error) => void
	onClose: () => void
	onData: (data: string) => void
	onConnect: () => void
}

export interface ICompanionSatelliteClient {
	write(data: string): void
	end(): void
	destroy(): void
}

export interface TcpConnectionDetails {
	mode: 'tcp'
	host: string
	port: number
}
export interface WsConnectionDetails {
	mode: 'ws'
	url: string
}
export type SomeConnectionDetails = TcpConnectionDetails | WsConnectionDetails

export class CompanionSatelliteTcpClient implements ICompanionSatelliteClient {
	#socket: Socket

	constructor(options: ICompanionSatelliteClientOptions, details: TcpConnectionDetails) {
		this.#socket = new Socket()

		this.#socket.on('error', (err) => options.onError(err))
		this.#socket.on('close', () => options.onClose())
		this.#socket.on('data', (data) => options.onData(data.toString()))
		this.#socket.on('connect', () => options.onConnect())

		this.#socket.connect(details.port, details.host)
	}

	write(data: string): void {
		this.#socket.write(data)
	}
	end(): void {
		this.#socket.end()
	}
	destroy(): void {
		this.#socket.destroy()
	}
}

export class CompanionSatelliteWsClient implements ICompanionSatelliteClient {
	#socket: WebSocket

	constructor(options: ICompanionSatelliteClientOptions, details: WsConnectionDetails) {
		this.#socket = new WebSocket(details.url, {
			timeout: 5000,
		})

		this.#socket.on('error', (err) => options.onError(err))
		this.#socket.on('close', () => options.onClose())
		this.#socket.on('message', (data) => options.onData(data.toString()))
		this.#socket.on('open', () => options.onConnect())
	}

	write(data: string): void {
		this.#socket.send(data)
	}
	end(): void {
		this.#socket.terminate()
	}
	destroy(): void {
		this.#socket.close()
	}
}

export function formatConnectionUrl(details: SomeConnectionDetails): string {
	if (details.mode === 'tcp') {
		return `tcp://${details.host}:${details.port}`
	} else {
		return details.url
	}
}
