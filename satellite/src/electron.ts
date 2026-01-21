import '@julusian/segfault-raub'

import { closeLogger } from './logging.js'
import { app, Tray, Menu, MenuItem, dialog, nativeImage, BrowserWindow, ipcMain, shell } from 'electron'
import * as path from 'path'
import electronStore from 'electron-store'
import { SurfaceManager } from './surface-manager.js'
import { CompanionSatelliteClient } from './client.js'
import { RestServer } from './rest.js'
import {
	SatelliteConfig,
	ensureFieldsPopulated,
	getConnectionDetailsFromConfig,
	listenToConnectionConfigChanges,
} from './config.js'
import {
	ApiConfigData,
	ApiConfigDataUpdateElectron,
	ApiStatusResponse,
	ApiSurfaceInfo,
	ApiSurfacePluginInfo,
	ApiSurfacePluginsEnabled,
	compileConfig,
	compileStatus,
	updateConfig,
	updateSurfacePluginsEnabledConfig,
} from './apiTypes.js'
import { fileURLToPath } from 'url'
import { MdnsAnnouncer } from './mdnsAnnouncer.js'
import debounceFn from 'debounce-fn'
import { ElectronUpdater } from './electronUpdater.js'
import { setMaxListeners } from 'events'
import { ModuleManager } from './module-store/index.js'

const appConfig = new electronStore<SatelliteConfig>({
	// schema: satelliteConfigSchema,
	// migrations: satelliteConfigMigrations,
})
setMaxListeners(0, appConfig.events)
ensureFieldsPopulated(appConfig)

const electronUpdater = new ElectronUpdater()

let tray: Tray | undefined
let configWindow: BrowserWindow | undefined
let aboutWindow: BrowserWindow | undefined

app.on('window-all-closed', () => {
	// Block default behaviour of exit on close
})

console.log('Starting')

// Initialize the module manager using electron's userData path
const moduleManager = new ModuleManager(app.getPath('userData'), app.getVersion())

console.log('Initializing module manager...')
await moduleManager.init()

// Ensure modules are installed for enabled plugins
await moduleManager.ensureModulesForConfig(appConfig.get('surfacePluginsEnabled'))

const webRoot = fileURLToPath(new URL(app.isPackaged ? '../../webui' : '../../webui/dist', import.meta.url))

const client = new CompanionSatelliteClient({ debug: true })
const surfaceManager = await SurfaceManager.create(
	client,
	appConfig.get('surfacePluginsEnabled'),
	moduleManager.getLoadedPlugins(),
)
const server = new RestServer(webRoot, appConfig, client, surfaceManager, moduleManager)
const mdnsAnnouncer = new MdnsAnnouncer(appConfig)

listenToConnectionConfigChanges(appConfig, tryConnect)
appConfig.onDidChange(
	'surfacePluginsEnabled',
	debounceFn(() => surfaceManager.updatePluginsEnabled(appConfig.get('surfacePluginsEnabled')), {
		wait: 50,
		after: true,
		before: false,
	}),
)

client.on('log', (l) => console.log(l))
client.on('error', (e) => console.error(e))

function tryConnect() {
	client.connect(getConnectionDetailsFromConfig(appConfig)).catch((e) => {
		console.log('Failed to update connection: ', e)
	})
}
function restartRestApi() {
	server.open()
}

const trayMenu = new Menu()
trayMenu.append(
	new MenuItem({
		label: 'Scan devices',
		click: trayScanDevices,
	}),
)
trayMenu.append(
	new MenuItem({
		label: 'Configure',
		click: () => {
			if (configWindow?.isVisible()) return

			const isProduction = app.isPackaged

			configWindow = new BrowserWindow({
				show: false,
				width: 720,
				minWidth: 500,
				maxWidth: isProduction ? 720 : undefined,
				height: 900,
				minHeight: 500,
				autoHideMenuBar: isProduction,
				webPreferences: {
					preload: fileURLToPath(new URL('../dist/electronPreload.cjs', import.meta.url)),
				},
				// resizable: !isProduction,
			})
			configWindow.on('close', () => {
				configWindow = undefined
			})
			if (isProduction) {
				configWindow.removeMenu()
				configWindow
					.loadFile(path.join(webRoot, 'electron.html'))
					.then(() => {
						configWindow?.show()
					})
					.catch((e) => {
						console.error('Failed to load file', e)
					})
			} else {
				configWindow
					.loadURL('http://localhost:5173/electron.html')
					.then(() => {
						configWindow?.show()
					})
					.catch((e) => {
						console.error('Failed to load file', e)
					})
			}
		},
	}),
)
trayMenu.append(electronUpdater.menuItem)
trayMenu.append(
	new MenuItem({
		label: 'About',
		click: trayAbout,
	}),
)
trayMenu.append(
	new MenuItem({
		label: 'Quit',
		click: trayQuit,
	}),
)

app.on('before-quit', () => {
	Promise.allSettled([
		// cleanup
		(async () => client.disconnect())(),
		surfaceManager.close(),
	])
		.then(async () => {
			await closeLogger()
		})
		.catch((e) => {
			console.error('Failed to do quit', e)
		})
})

app.whenReady()
	.then(async () => {
		console.log('App ready')

		electronUpdater.check()

		tryConnect()
		restartRestApi()
		mdnsAnnouncer.start()

		let trayImagePath = new URL('../assets/tray.png', import.meta.url)
		let trayImageOfflinePath = new URL('../assets/tray-offline.png', import.meta.url)
		switch (process.platform) {
			case 'darwin':
				trayImagePath = new URL('../assets/trayTemplate.png', import.meta.url)
				trayImageOfflinePath = new URL('../assets/trayOfflineTemplate.png', import.meta.url)
				break
			case 'win32':
				trayImagePath = new URL('../assets/tray.ico', import.meta.url)
				trayImageOfflinePath = new URL('../assets/tray-offline.ico', import.meta.url)
				break
		}
		const trayImage = nativeImage.createFromPath(fileURLToPath(trayImagePath))
		const trayImageOffline = nativeImage.createFromPath(fileURLToPath(trayImageOfflinePath))

		tray = new Tray(trayImageOffline)

		client.on('connected', () => {
			tray?.setImage(trayImage)
		})
		client.on('disconnected', () => {
			tray?.setImage(trayImageOffline)
		})

		console.log('set tray')
		tray.setContextMenu(trayMenu)
	})
	.catch((e) => {
		dialog.showErrorBox(`Startup error`, `Failed to launch: ${e}`)
	})

function trayQuit() {
	console.log('quit click')
	dialog
		.showMessageBox({
			title: 'Companion Satellite',
			message: 'Are you sure you want to quit Companion Satellite?',
			buttons: ['Quit', 'Cancel'],
		})
		.then(async (v) => {
			console.log('quit: ', v.response)
			if (v.response === 0) {
				app.quit()
			}
		})
		.catch((e) => {
			console.error('Failed to do quit', e)
		})
}

function trayScanDevices() {
	console.log('do scan')
	surfaceManager.scanForSurfaces()
}

function trayAbout() {
	if (aboutWindow?.isVisible()) return
	console.log('about click')

	const isProduction = app.isPackaged

	aboutWindow = new BrowserWindow({
		show: false,
		width: 400,
		height: 400,
		autoHideMenuBar: isProduction,
		icon: fileURLToPath(new URL('../assets/icon.png', import.meta.url)),
		resizable: !isProduction,
		webPreferences: {
			preload: fileURLToPath(new URL('../dist/aboutPreload.cjs', import.meta.url)),
		},
	})
	aboutWindow.on('close', () => {
		aboutWindow = undefined
	})
	if (isProduction) {
		aboutWindow.removeMenu()
		aboutWindow
			.loadFile(path.join(webRoot, 'about.html'))
			.then(() => {
				if (!aboutWindow) return

				aboutWindow.show()
				aboutWindow.focus()

				aboutWindow.webContents.send('about-version', app.getVersion())
			})
			.catch((e) => {
				console.error('Failed to load file', e)
			})
	} else {
		aboutWindow
			.loadURL('http://localhost:5173/about.html')
			.then(() => {
				if (!aboutWindow) return

				aboutWindow.show()
				aboutWindow.focus()

				aboutWindow.webContents.send('about-version', app.getVersion())
			})
			.catch((e) => {
				console.error('Failed to load file', e)
			})
	}
}

ipcMain.on('rescan', () => {
	console.log('rescan')
	surfaceManager.scanForSurfaces()
})
ipcMain.handle('getStatus', async (): Promise<ApiStatusResponse> => {
	// console.log('getStatus')
	return compileStatus(client)
})
ipcMain.handle('getConfig', async (): Promise<ApiConfigData> => {
	return compileConfig(appConfig)
})
ipcMain.handle('saveConfig', async (_e, newConfig: ApiConfigDataUpdateElectron): Promise<ApiConfigData> => {
	console.log('saveConfig', newConfig)
	updateConfig(appConfig, newConfig)
	return compileConfig(appConfig)
})
ipcMain.handle('connectedSurfaces', async (): Promise<ApiSurfaceInfo[]> => {
	return surfaceManager.getOpenSurfacesInfo()
})
ipcMain.handle('surfacePlugins', async (): Promise<ApiSurfacePluginInfo[]> => {
	return surfaceManager.getAvailablePluginsInfo()
})
ipcMain.handle('surfacePluginsEnabled', async (): Promise<ApiSurfacePluginsEnabled> => {
	return appConfig.get('surfacePluginsEnabled')
})
ipcMain.handle(
	'surfacePluginsEnabledUpdate',
	async (_e, newConfig: ApiSurfacePluginsEnabled): Promise<ApiSurfacePluginsEnabled> => {
		updateSurfacePluginsEnabledConfig(appConfig, newConfig)
		return appConfig.get('surfacePluginsEnabled')
	},
)
ipcMain.handle('modulesAvailable', async () => {
	const modules = moduleManager.getAvailableModules()
	return {
		modules: modules ? Object.values(modules) : [],
		lastUpdated: Date.now(),
	}
})
ipcMain.handle('modulesInstalled', async () => {
	return {
		modules: moduleManager.getInstalledModules().map((m) => ({
			id: m.id,
			name: m.manifest.name,
			version: m.version,
			isBeta: m.isBeta,
		})),
	}
})
ipcMain.handle('modulesUpdates', async () => {
	const updates = await moduleManager.checkForUpdates()
	return { updates }
})
ipcMain.handle('installModule', async (_e, moduleId: string, version?: string) => {
	try {
		await moduleManager.installModule(moduleId, version)
		// Add newly loaded plugin to SurfaceManager for immediate device detection
		const loadedPlugins = moduleManager.getLoadedPlugins()
		const newPlugin = loadedPlugins.find((p) => p.info.pluginId === moduleId)
		if (newPlugin) {
			await surfaceManager.addPlugin(newPlugin)
		}
		return { success: true }
	} catch (e) {
		return { success: false, error: e instanceof Error ? e.message : String(e) }
	}
})
ipcMain.handle('uninstallModule', async (_e, moduleId: string, version: string) => {
	return moduleManager.uninstallModule(moduleId, version)
})

// about window
ipcMain.handle('openShell', async (_e, url: string): Promise<void> => {
	console.log('openShell', url)
	shell.openExternal(url).catch((e) => {
		console.error('Failed to open shell', e)
	})
})
ipcMain.handle('getVersion', async (): Promise<string> => {
	return app.getVersion()
})
