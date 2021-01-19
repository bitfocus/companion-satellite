import { CompanionSatelliteClient } from './client'
import { DeviceManager } from './devices'

export function init(): CompanionSatelliteClient {
	console.log('Starting')

	const client = new CompanionSatelliteClient({ debug: true })
	const devices = new DeviceManager(client)

	client.on('log', (l) => console.log(l))
	client.on('error', (e) => console.error(e))

	// @ts-expect-error keep devicemanager alive
	client._devices = devices
	return client
}
