import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CompanionSatelliteClient, type CompanionSatelliteSocketFactory, type DeviceRegisterProps } from '../client.js'
import type { ICompanionSatelliteClient, ICompanionSatelliteClientOptions } from '../socketImplementations.js'

class FakeSocket implements ICompanionSatelliteClient {
	readonly writes: string[] = []
	destroyed = false
	autoPong = false
	ackDeviceSynchronously = false

	constructor(private readonly options: ICompanionSatelliteClientOptions) {}

	connect(): void {
		this.options.onConnect()
	}

	receive(data: string): void {
		this.options.onData(data)
	}

	close(): void {
		this.options.onClose()
	}

	write(data: string): void {
		this.writes.push(data)
		if (this.autoPong && data === 'PING\n') this.receive('PONG\n')
		if (this.ackDeviceSynchronously && data.startsWith('ADD-DEVICE ')) {
			this.receive('ADD-DEVICE OK DEVICEID="deck-1"\n')
		}
	}

	end(): void {}

	destroy(): void {
		this.destroyed = true
	}
}

function createClient(): { client: CompanionSatelliteClient; sockets: FakeSocket[] } {
	const sockets: FakeSocket[] = []
	const socketFactory: CompanionSatelliteSocketFactory = (options) => {
		const socket = new FakeSocket(options)
		sockets.push(socket)
		return socket
	}

	return {
		client: new CompanionSatelliteClient({ socketFactory }),
		sockets,
	}
}

const registerProps: DeviceRegisterProps = {
	serialNumber: 'test-serial',
	serialIsUnique: true,
	brightness: true,
	surfaceManifest: { stylePresets: {} } as DeviceRegisterProps['surfaceManifest'],
	transferVariables: undefined,
	configFields: undefined,
	canChangePage: undefined,
	gridSize: { columns: 8, rows: 4 },
	fallbackBitmapSize: 72,
}

describe('CompanionSatelliteClient recovery', () => {
	beforeEach(() => vi.useFakeTimers())
	afterEach(() => vi.useRealTimers())

	it('reconnects when the Satellite handshake never completes, even while pongs arrive', async () => {
		const { client, sockets } = createClient()
		const logs: string[] = []
		client.on('log', (message) => logs.push(message))

		await client.connect({ mode: 'tcp', host: '127.0.0.1', port: 16622 })
		const socket = sockets[0]
		socket.autoPong = true
		socket.connect()

		await vi.advanceTimersByTimeAsync(10000)

		expect(socket.destroyed).toBe(true)
		expect(logs).toContain('Satellite handshake timeout')

		socket.close()
		await vi.advanceTimersByTimeAsync(1000)
		expect(sockets).toHaveLength(2)
	})

	it('ignores a delayed close callback from a superseded socket', async () => {
		const { client, sockets } = createClient()

		await client.connect({ mode: 'tcp', host: '127.0.0.1', port: 16622 })
		sockets[0].connect()

		await client.connect({ mode: 'tcp', host: '127.0.0.2', port: 16622 })
		sockets[1].connect()
		sockets[0].close()

		expect(client.connected).toBe(true)
	})

	it('lets the active close callback finish an explicit disconnect', async () => {
		const { client, sockets } = createClient()
		const disconnected = vi.fn()
		client.on('disconnected', disconnected)

		await client.connect({ mode: 'tcp', host: '127.0.0.1', port: 16622 })
		sockets[0].connect()
		client.disconnect()
		sockets[0].close()

		expect(client.connected).toBe(false)
		expect(disconnected).toHaveBeenCalledOnce()
		await vi.advanceTimersByTimeAsync(1000)
		expect(sockets).toHaveLength(1)
	})

	it('releases a device for an isolated retry when registration is not acknowledged', async () => {
		const { client, sockets } = createClient()
		const deviceErrors: string[] = []
		client.on('deviceErrored', ({ deviceId }) => deviceErrors.push(deviceId))

		await client.connect({ mode: 'tcp', host: '127.0.0.1', port: 16622 })
		sockets[0].autoPong = true
		sockets[0].connect()
		client.addDevice('deck-1', 'Test Deck', registerProps)

		expect(client.hasDevice('deck-1')).toBe(true)
		await vi.advanceTimersByTimeAsync(10000)

		expect(client.hasDevice('deck-1')).toBe(false)
		expect(deviceErrors).toEqual(['deck-1'])
	})

	it('cancels the registration watchdog after a synchronous acknowledgement', async () => {
		const { client, sockets } = createClient()
		const deviceErrors: string[] = []
		client.on('deviceErrored', ({ deviceId }) => deviceErrors.push(deviceId))

		await client.connect({ mode: 'tcp', host: '127.0.0.1', port: 16622 })
		sockets[0].autoPong = true
		sockets[0].ackDeviceSynchronously = true
		sockets[0].connect()
		client.addDevice('deck-1', 'Test Deck', registerProps)

		await vi.advanceTimersByTimeAsync(10000)

		expect(client.hasDevice('deck-1')).toBe(true)
		expect(deviceErrors).toEqual([])
	})

	it('releases a rejected device so the existing retry path can re-add it', async () => {
		const { client, sockets } = createClient()
		const deviceErrors: string[] = []
		client.on('deviceErrored', ({ deviceId }) => deviceErrors.push(deviceId))

		await client.connect({ mode: 'tcp', host: '127.0.0.1', port: 16622 })
		sockets[0].connect()
		client.addDevice('deck-1', 'Test Deck', registerProps)
		sockets[0].receive('ADD-DEVICE ERROR DEVICEID="deck-1" MESSAGE="Rejected"\n')

		expect(client.hasDevice('deck-1')).toBe(false)
		expect(deviceErrors).toEqual(['deck-1'])
	})
})
