import { CompanionSatelliteClient } from './client'
import { DeviceManager } from './devices'

console.log('hello')

const client = new CompanionSatelliteClient({ debug: true })
const devices = new DeviceManager(client)

client.on('log', (l) => console.log(l))
client.on('error', (e) => console.error(e))

client.connect('127.0.0.1')
devices
