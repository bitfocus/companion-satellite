import { CompanionSatelliteClient } from './client'
import { DeviceManager } from './devices'

console.log('hello')

const client = new CompanionSatelliteClient({ debug: true })
const devices = new DeviceManager(client)

client.on('log', (l) => console.log(l))
client.on('error', (e) => console.error(e))

client.connect('10.42.13.186')
devices // reference value
