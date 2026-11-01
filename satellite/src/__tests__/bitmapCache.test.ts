import { describe, it, expect, beforeEach } from 'vitest'
import { parseLineParameters, splitSatelliteCommand, type ParsedParams } from '@companion-app/satellite-protocol/codec'
import {
	CompanionSatelliteClient,
	type CompanionSatelliteClientDrawProps,
	type DeviceRegisterProps,
} from '../client/client.js'

const DEVICE_PROPS: DeviceRegisterProps = {
	serialNumber: 'abc',
	serialIsUnique: true,
	brightness: true,
	surfaceManifest: {
		stylePresets: { default: { bitmap: { w: 10, h: 10 } }, empty: {} },
		controls: {
			'0/0': { row: 0, column: 0 },
			'0/1': { row: 0, column: 1 },
			'1/0': { row: 1, column: 0, stylePreset: 'empty' },
		},
	},
	transferVariables: undefined,
	configFields: undefined,
	canChangePage: undefined,
	gridSize: { rows: 2, columns: 2 },
	fallbackBitmapSize: 72,
}

// Two controls with a 10x10 bitmap, counted as RGBA
const BYTES_PER_FRAME = 2 * 10 * 10 * 4

interface SentMessage {
	command: string
	params: ParsedParams
}

/**
 * Connect a client to a fake socket, completing the handshake with a Companion which supports bitmap caching
 */
async function createConnectedClient(caps = 'BITMAP_CACHE=1'): Promise<{
	client: CompanionSatelliteClient
	sent: SentMessage[]
	draws: CompanionSatelliteClientDrawProps[]
	receive: (line: string) => void
}> {
	const client = new CompanionSatelliteClient()
	const sent: SentMessage[] = []
	const draws: CompanionSatelliteClientDrawProps[] = []

	const internals = client as any
	internals.socket = {
		write: (data: string) => {
			for (const line of data.split('\n').filter(Boolean)) {
				const { command, body } = splitSatelliteCommand(line)
				sent.push({ command, params: parseLineParameters(body) })
			}
		},
		destroy: () => {},
		end: () => {},
	}
	internals._connected = true

	const receive = (line: string) => internals._handleReceivedData(`${line}\n`)
	client.on('draw', (props) => draws.push(props))

	receive('BEGIN CompanionVersion=5.2.0 ApiVersion=1.16.0')
	receive(`CAPS ${caps}`)
	await new Promise((resolve) => setImmediate(resolve))

	return { client, sent, draws, receive }
}

const flush = async () => new Promise((resolve) => setImmediate(resolve))

describe('bitmap cache', () => {
	let ctx: Awaited<ReturnType<typeof createConnectedClient>>
	beforeEach(async () => {
		ctx = await createConnectedClient()
	})

	it('scales the budget by the bitmaps of each device', async () => {
		ctx.client.setBitmapCacheBitmapsPerButton(5)
		ctx.client.addDevice('dev1', 'Test', DEVICE_PROPS)
		ctx.client.addDevice('dev2', 'Test', DEVICE_PROPS)
		await flush()

		const budgets = ctx.sent.filter((m) => m.command === 'BITMAP-CACHE')
		expect(budgets).toEqual([{ command: 'BITMAP-CACHE', params: { BYTES: `${BYTES_PER_FRAME * 5 * 2}` } }])

		ctx.client.removeDevice('dev2')
		await flush()
		expect(ctx.sent.filter((m) => m.command === 'BITMAP-CACHE').at(-1)?.params.BYTES).toBe(`${BYTES_PER_FRAME * 5}`)
	})

	it('sends a budget of 0 when disabled', async () => {
		ctx.client.setBitmapCacheBitmapsPerButton(16)
		ctx.client.addDevice('dev1', 'Test', DEVICE_PROPS)
		await flush()
		ctx.client.setBitmapCacheBitmapsPerButton(0)
		await flush()

		expect(ctx.sent.filter((m) => m.command === 'BITMAP-CACHE').map((m) => m.params.BYTES)).toEqual([
			`${BYTES_PER_FRAME * 16}`,
			'0',
		])
	})

	it('does not enable caching when Companion does not offer it', async () => {
		ctx = await createConnectedClient('BITMAP_CACHE=0')
		ctx.client.setBitmapCacheBitmapsPerButton(16)
		ctx.client.addDevice('dev1', 'Test', DEVICE_PROPS)
		await flush()

		expect(ctx.sent.filter((m) => m.command === 'BITMAP-CACHE')).toEqual([])
	})

	it('stores, reuses and evicts bitmaps', () => {
		ctx.receive('KEY-STATE DEVICEID=dev1 CONTROLID=0/0 BITMAP=AAAA BITMAP_ID=one')
		ctx.receive('KEY-STATE DEVICEID=dev1 CONTROLID=0/1 BITMAP_ID=one')
		ctx.receive('KEY-STATE DEVICEID=dev1 CONTROLID=0/0 BITMAP=BBBB')
		ctx.receive('KEY-STATE DEVICEID=dev1 CONTROLID=0/1 BITMAP_ID=one')
		ctx.receive('BITMAP-EVICT BITMAP_IDS=one,two')
		ctx.receive('KEY-STATE DEVICEID=dev1 CONTROLID=0/1 BITMAP_ID=one')

		expect(ctx.draws.map((d) => d.image)).toEqual(['AAAA', 'AAAA', 'BBBB', 'AAAA', undefined])
	})

	it('evicts everything', () => {
		ctx.receive('KEY-STATE DEVICEID=dev1 CONTROLID=0/0 BITMAP=AAAA BITMAP_ID=one')
		ctx.receive('BITMAP-EVICT ALL=1')
		ctx.receive('KEY-STATE DEVICEID=dev1 CONTROLID=0/1 BITMAP_ID=one')

		expect(ctx.draws.map((d) => d.image)).toEqual(['AAAA', undefined])
	})

	it('reports the cost of compressed bitmaps only', () => {
		const dataUrl = 'data:image/png;base64,AAAA'
		ctx.receive(`KEY-STATE DEVICEID=dev1 CONTROLID=0/0 BITMAP=${dataUrl} BITMAP_ID=png`)
		ctx.receive('KEY-STATE DEVICEID=dev1 CONTROLID=0/0 BITMAP=AAAA BITMAP_ID=rgb')

		expect(ctx.sent.filter((m) => m.command === 'BITMAP-COST')).toEqual([
			{ command: 'BITMAP-COST', params: { BITMAP_ID: 'png', BYTES: `${dataUrl.length}` } },
		])
	})

	it('forgets the cache when the connection restarts', () => {
		ctx.receive('KEY-STATE DEVICEID=dev1 CONTROLID=0/0 BITMAP=AAAA BITMAP_ID=one')
		ctx.receive('BEGIN CompanionVersion=5.2.0 ApiVersion=1.16.0')
		ctx.receive('KEY-STATE DEVICEID=dev1 CONTROLID=0/1 BITMAP_ID=one')

		expect(ctx.draws.map((d) => d.image)).toEqual(['AAAA', undefined])
	})
})
