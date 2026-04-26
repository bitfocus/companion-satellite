/* eslint-disable n/no-process-exit */
import { IpcWrapper, type IpcCallMessagePacket, type IpcResponseMessagePacket } from '../lib/ipc-wrapper.js'
import type { SurfaceModuleToHostEvents, HostToSurfaceModuleEvents, CheckDeviceInfo, InitMessage } from './ipc-types.js'
import {
	type SurfaceModuleManifest,
	registerLoggingSink,
	createModuleLogger,
	PluginWrapper,
} from '@companion-surface/host'
import fs from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { HostContext } from './host-context.js'

async function main() {
	const moduleEntrypoint = process.env.MODULE_ENTRYPOINT
	if (!moduleEntrypoint) throw new Error('Module initialise is missing MODULE_ENTRYPOINT')

	const manifestPath = process.env.MODULE_MANIFEST
	if (!manifestPath) throw new Error('Module initialise is missing MODULE_MANIFEST')

	const manifestBlob = await fs.readFile(manifestPath, 'utf-8')
	const manifestJson: Partial<SurfaceModuleManifest> = JSON.parse(manifestBlob)

	if (!manifestJson.runtime?.apiVersion) throw new Error(`Module manifest 'apiVersion' missing`)

	if (!process.send) throw new Error('Module is not being run with ipc')

	console.log(`Starting up surface module: ${manifestJson.id}`)

	const verificationToken = process.env.VERIFICATION_TOKEN
	if (typeof verificationToken !== 'string' || !verificationToken)
		throw new Error('Module initialise is missing VERIFICATION_TOKEN')

	const logger = createModuleLogger('Entrypoint')

	let plugin: PluginWrapper | null = null
	let hostContext: HostContext | null = null
	let pluginInitialized = false

	const ipcWrapper = new IpcWrapper<SurfaceModuleToHostEvents, HostToSurfaceModuleEvents>(
		{
			init: async (msg: InitMessage) => {
				if (pluginInitialized) throw new Error('Already initialized')
				if (!plugin) throw new Error('Plugin not loaded')
				if (!hostContext) throw new Error('HostContext not created')

				// This is safe, as the plugin doesn't have access to the capabilities until we call init
				hostContext.capabilities.supportsNonSquareButtons = msg.supportsNonSquareButtons

				await plugin.init()

				pluginInitialized = true

				logger.info('Module initialized successfully')
			},
			destroy: async () => {
				if (!plugin || !pluginInitialized) throw new Error('Not initialized')

				pluginInitialized = false

				await plugin.destroy()

				setTimeout(() => process.exit(0), 100)
			},

			openHidDevice: async (msg) => {
				if (!plugin || !pluginInitialized) throw new Error('Not initialized')

				const info = await plugin.openHidDevice(msg.device, msg.resolvedSurfaceId)
				if (!info) return { info: null }

				return {
					info: {
						...info,
						surfaceId: msg.resolvedSurfaceId,
						configFields: info.configFields ?? null,
					},
				}
			},
			checkHidDevices: async (msg) => {
				if (!plugin || !pluginInitialized) throw new Error('Not initialized')

				const devices: CheckDeviceInfo[] = []
				for (const device of msg.devices) {
					const result = await plugin.checkHidDevice(device)
					if (result) {
						devices.push({
							devicePath: device.path,
							surfaceId: result.surfaceId,
							surfaceIdIsNotUnique: result.surfaceIdIsNotUnique,
							description: result.description,
						})
					}
				}
				return { devices }
			},
			scanDevices: async () => {
				if (!plugin || !pluginInitialized) throw new Error('Not initialized')

				const devices = await plugin.scanForDevices()
				return {
					devices: devices.map((d) => ({
						devicePath: d.devicePath,
						surfaceId: d.surfaceId,
						surfaceIdIsNotUnique: d.surfaceIdIsNotUnique,
						description: d.description,
					})),
				}
			},
			openScannedDevice: async (msg) => {
				if (!plugin || !pluginInitialized) throw new Error('Not initialized')

				const info = await plugin.openScannedDevice(
					{
						devicePath: msg.device.devicePath,
						surfaceId: msg.device.surfaceId,
						surfaceIdIsNotUnique: msg.device.surfaceIdIsNotUnique,
						description: msg.device.description,
					},
					msg.resolvedSurfaceId,
				)
				if (!info) return { info: null }

				return {
					info: {
						...info,
						surfaceId: msg.resolvedSurfaceId,
						configFields: info.configFields ?? null,
					},
				}
			},
			closeSurface: async (msg) => {
				if (!plugin || !pluginInitialized) throw new Error('Not initialized')

				await plugin.closeDevice(msg.surfaceId)
			},
			readySurface: async (msg) => {
				if (!plugin || !pluginInitialized) throw new Error('Not initialized')

				await plugin.readySurface(msg.surfaceId, msg.initialConfig)
			},
			updateConfig: async (msg) => {
				if (!plugin || !pluginInitialized) throw new Error('Not initialized')

				await plugin.updateConfig(msg.surfaceId, msg.newConfig)
			},
			setBrightness: async (msg) => {
				if (!plugin || !pluginInitialized) throw new Error('Not initialized')

				await plugin.setBrightness(msg.surfaceId, msg.brightness)
			},
			drawControls: async (msg) => {
				if (!plugin || !pluginInitialized) throw new Error('Not initialized')

				await plugin.draw(
					msg.surfaceId,
					msg.drawProps.map((d) => ({
						...d,
						image: d.image ? Buffer.from(d.image, 'base64') : undefined,
					})),
				)
			},
			blankSurface: async (msg) => {
				if (!plugin || !pluginInitialized) throw new Error('Not initialized')

				await plugin.blankSurface(msg.surfaceId)
			},
			setLocked: async (msg) => {
				if (!plugin || !pluginInitialized) throw new Error('Not initialized')

				await plugin.showLockedStatus(msg.surfaceId, msg.locked, msg.characterCount)
			},
			setOutputVariable: async (msg) => {
				if (!plugin || !pluginInitialized) throw new Error('Not initialized')

				await plugin.onVariableValue(msg.surfaceId, msg.name, msg.value)
			},
			showStatus: async (msg) => {
				if (!plugin || !pluginInitialized) throw new Error('Not initialized')

				await plugin.showStatus(msg.surfaceId, msg.displayHost, msg.message)
			},
			setupRemoteConnections: async (msg) => {
				if (!plugin || !pluginInitialized) throw new Error('Not initialized')

				await plugin.setupRemoteConnections(msg.connectionInfos)
			},
			stopRemoteConnections: async (msg) => {
				if (!plugin || !pluginInitialized) throw new Error('Not initialized')

				await plugin.stopRemoteConnections(msg.connectionIds)
			},
		},
		(msg) => {
			process.send!(msg)
		},
		5000,
	)
	process.on('message', (msg) => ipcWrapper.receivedMessage(msg as IpcCallMessagePacket | IpcResponseMessagePacket))

	registerLoggingSink((source, level, message) => {
		if (!process.send) {
			console.log(`[${level.toUpperCase()}]${source ? ` [${source}]` : ''} ${message}`)
		} else {
			ipcWrapper.sendWithNoCb('log-message', {
				time: Date.now(),
				source,
				level,
				message,
			})
		}
	})

	const moduleUrl = pathToFileURL(moduleEntrypoint).href
	const moduleImport = await import(moduleUrl)

	const isSurfaceModule = (obj: any) => {
		if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return false
		return typeof obj.init === 'function' && typeof obj.destroy === 'function'
	}

	const moduleConstructor = isSurfaceModule(moduleImport) ? moduleImport : moduleImport.default
	if (!isSurfaceModule(moduleConstructor)) throw new Error(`Module entrypoint did not return a valid surface plugin`)

	hostContext = new HostContext(ipcWrapper)
	plugin = new PluginWrapper(hostContext, moduleConstructor)

	const pluginFeatures = plugin.getPluginFeatures()
	ipcWrapper
		.sendWithCb('register', {
			verificationToken,

			supportsDetection: pluginFeatures.supportsDetection,
			supportsHid: pluginFeatures.supportsHid,
			supportsScan: pluginFeatures.supportsScan,
			supportsOutbound: pluginFeatures.supportsOutbound
				? {
						configFields: pluginFeatures.supportsOutbound.configFields,
					}
				: null,
		})
		.then(async () => {
			logger.info(`Module-host accepted registration`)
		})
		.catch((err) => {
			logger.error(`Module registration failed: ${err}`)

			process.exit(11)
		})
}

main().catch((err) => {
	console.error('Surface module startup failed:', err)
	process.exit(1)
})
