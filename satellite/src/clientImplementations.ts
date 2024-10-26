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

export class CompanionSatelliteTcpClient implements ICompanionSatelliteClient {
	#socket: Socket

	constructor(options: ICompanionSatelliteClientOptions, host: string, port: number) {
		this.#socket = new Socket()

		this.#socket.on('error', (err) => options.onError(err))
		this.#socket.on('close', () => options.onClose())
		this.#socket.on('data', (data) => options.onData(data.toString()))
		this.#socket.on('connect', () => options.onConnect())

		this.#socket.connect(port, host)
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

	constructor(options: ICompanionSatelliteClientOptions, address: string) {
		this.#socket = new WebSocket(address, {
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
