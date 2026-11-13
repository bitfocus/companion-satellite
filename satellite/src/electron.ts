import '@julusian/segfault-raub'

import { app, Tray, Menu, MenuItem, dialog, nativeImage, BrowserWindow, ipcMain, shell, Notification } from 'electron'
import * as path from 'path'
import electronStore from 'electron-store'
import { SurfaceManager } from './surface-manager.js'
import { CompanionSatelliteClient } from './client/client.js'
import { RestServer } from './rest.js'
import { flushLogger } from './logging.js'
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
	ApiUpdateInfo,
	ApiUsageStatisticsPayload,
	compileConfig,
	compileStatus,
	updateConfig,
	updateSurfacePluginsEnabledConfig,
} from './apiTypes.js'
import { fileURLToPath } from 'url'
import { MdnsAnnouncer } from './mdnsAnnouncer.js'
import debounceFn from 'debounce-fn'
import { setMaxListeners } from 'events'
import { getAppInfo } from './appInfo.js'
import { UpdateChecker } from './usage/updateChecker.js'
import { UsageStatistics } from './usage/usageStatistics.js'

// Ensure there isn't another instance of companion running already
const lock = app.requestSingleInstanceLock()
if (!lock) {
	dialog.showErrorBox(
		'Multiple instances',
		'Another instance is already running. Please close the other instance first.',
	)
	app.quit()
	// eslint-disable-next-line n/no-process-exit
	process.exit(0)
}

const appConfig = new electronStore<SatelliteConfig>({
	// schema: satelliteConfigSchema,
	// migrations: satelliteConfigMigrations,
})
setMaxListeners(0, appConfig.events)
ensureFieldsPopulated(appConfig)

// const electronUpdater = new ElectronUpdater()

let tray: Tray | undefined
let configWindow: BrowserWindow | undefined
let aboutWindow: BrowserWindow | undefined

app.on('window-all-closed', () => {
	// Block default behaviour of exit on close
})

console.log('Starting')

const webRoot = fileURLToPath(new URL(app.isPackaged ? '../../webui' : '../../webui/dist', import.meta.url))

const appInfo = getAppInfo(true)

const client = new CompanionSatelliteClient({ debug: true })
const surfaceManager = await SurfaceManager.create(client, appConfig.get('surfacePluginsEnabled'), app.isPackaged)
const updateChecker = new UpdateChecker(appInfo, appConfig)
const usageStatistics = new UsageStatistics(appInfo, appConfig, client, surfaceManager)
const server = new RestServer(webRoot, appConfig, client, surfaceManager, updateChecker, usageStatistics)
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
				height: 960,
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
			// Open links (eg update downloads) in the browser, rather than a new electron window
			configWindow.webContents.setWindowOpenHandler(({ url }) => {
				shell.openExternal(url).catch((e) => {
					console.error('Failed to open shell', e)
				})
				return { action: 'deny' }
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
// trayMenu.append(electronUpdater.menuItem)
const updateMenuSeparator = new MenuItem({ type: 'separator', visible: false })
const updateMenuItem = new MenuItem({
	label: 'Download update',
	visible: false,
	click: () => openUpdateLink(),
})
trayMenu.append(updateMenuSeparator)
trayMenu.append(updateMenuItem)
trayMenu.append(new MenuItem({ type: 'separator' }))
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

app.on('before-quit', (e) => {
	e.preventDefault()
	updateChecker.stop()
	usageStatistics.stop()
	Promise.allSettled([
		// cleanup
		(async () => client.disconnect())(),
		surfaceManager.close(),
	])
		.then(async () => {
			await flushLogger()
		})
		.catch((err) => {
			console.error('Failed to do quit', err)
		})
		.finally(() => {
			app.exit(0)
		})
})

app.whenReady()
	.then(async () => {
		console.log('App ready')

		// electronUpdater.check()

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

		if (process.platform === 'linux') {
			// Electron hands the tray icon to the desktop as a temporary file, which is replaced each time the image
			// changes. If it changes shortly after launch (eg connecting), the desktop can still be loading the old
			// file and show a missing icon. Setting it again once things have settled makes the desktop reload it
			setTimeout(() => {
				tray?.setImage(client.connected ? trayImage : trayImageOffline)
			}, 3000)
		}

		console.log('set tray')
		tray.setContextMenu(trayMenu)

		updateChecker.on('info', (info) => {
			// Only available updates are shown in the tray, anything else is left for the web UI
			const update = info?.type === 'update' && info.link ? info : null

			updateMenuItem.label = update ? `Download v${update.version}…` : 'Download update'
			updateMenuItem.visible = !!update
			updateMenuSeparator.visible = !!update
			// The menu needs to be set again for the changes to show on some platforms
			tray?.setContextMenu(trayMenu)

			// Notify once about each new version, unless the user has dismissed it in the web UI
			if (update && !update.dismissed && appConfig.get('notifiedUpdateVersion') !== update.version) {
				showUpdateNotification(update.version)
			}
		})
		updateChecker.start()
		usageStatistics.startStop()
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

// Keep a reference, or the notification can be garbage collected and lose its click handler
let updateNotification: Notification | undefined
function showUpdateNotification(version: string) {
	if (!Notification.isSupported()) return

	updateNotification = new Notification({
		title: `Companion Satellite v${version} is available`,
		body: 'Click to download',
	})
	updateNotification.on('click', () => openUpdateLink())
	updateNotification.show()

	appConfig.set('notifiedUpdateVersion', version)
}

function openUpdateLink() {
	const info = updateChecker.getInfo()
	if (info?.type !== 'update' || !info.link) return

	shell.openExternal(info.link).catch((e) => {
		console.error('Failed to open shell', e)
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

ipcMain.handle('getUpdateInfo', async (): Promise<ApiUpdateInfo | null> => {
	return updateChecker.getInfo()
})
ipcMain.handle('dismissUpdateInfo', async (): Promise<void> => {
	updateChecker.dismiss()
})
ipcMain.handle('getUsageStatistics', async (): Promise<ApiUsageStatisticsPayload> => {
	return { ...usageStatistics.buildPayload() }
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
