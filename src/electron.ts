// eslint-disable-next-line node/no-unpublished-import
import { app, Tray, Menu, MenuItem, dialog, nativeImage } from 'electron'
import * as path from 'path'
// eslint-disable-next-line node/no-unpublished-import
import * as electronStore from 'electron-store'
// eslint-disable-next-line node/no-unpublished-import
import * as prompt from 'electron-prompt'
// eslint-disable-next-line node/no-unpublished-import
import openAboutWindow from 'electron-about-window'
import { DeviceManager } from './devices'
import { CompanionSatelliteClient } from './client'
import { DEFAULT_PORT, DEFAULT_REST_PORT } from './lib'
import { RestServer } from './rest'

const store = new electronStore<SatelliteConfig>()
let tray: Tray | undefined

app.on('window-all-closed', () => {
	// Block default behaviour of exit on close
})

interface SatelliteConfig {
	remoteIp: string
	remotePort: number

	restPort: number | undefined
	restEnabled: boolean
}

console.log('Starting')

const client = new CompanionSatelliteClient({ debug: true })
const devices = new DeviceManager(client)
const server = new RestServer(client, devices)

client.on('log', (l) => console.log(l))
client.on('error', (e) => console.error(e))

client.on('ipChange', (newIP, newPort) => {
	// Store remote settings when it changes
	store.set('remoteIp', newIP)
	store.set('remotePort', newPort)
})

function tryConnect() {
	const ip = store.get('remoteIp')
	const port = store.get('remotePort') ?? DEFAULT_PORT
	if (ip) {
		client.connect(ip, port).catch((e) => {
			console.log('Failed to update connection: ', e)
		})
	}
}
function restartRestApi() {
	const restPort = Number(store.get('restPort') ?? DEFAULT_REST_PORT)
	if (store.get('restEnabled') && !isNaN(restPort) && restPort > 0 && restPort <= 65535) {
		server.open(restPort)
	} else {
		server.close()
	}
}

const menuItemApiEnableDisable = new MenuItem({
	label: 'Enable API',
	type: 'checkbox',
	click: toggleRestApi,
})
const menuItemApiPort = new MenuItem({
	label: 'Change API Port',
	click: changeRestPort,
})
const trayMenu = new Menu()
trayMenu.append(
	new MenuItem({
		label: 'Change Host',
		click: changeHost,
	})
)
trayMenu.append(
	new MenuItem({
		label: 'Change Port',
		click: changePort,
	})
)
trayMenu.append(menuItemApiEnableDisable)
trayMenu.append(menuItemApiPort)
trayMenu.append(
	new MenuItem({
		label: 'Scan devices',
		click: trayScanDevices,
	})
)
trayMenu.append(
	new MenuItem({
		label: 'About',
		click: trayAbout,
	})
)
trayMenu.append(
	new MenuItem({
		label: 'Quit',
		click: trayQuit,
	})
)

function updateTray() {
	if (!tray) throw new Error(`Tray not ready`)

	const restEnabled = !!store.get('restEnabled')

	menuItemApiEnableDisable.checked = restEnabled
	menuItemApiPort.enabled = restEnabled

	console.log('set tray')
	tray.setContextMenu(trayMenu)
}

app.whenReady()
	.then(function () {
		console.log('App ready')

		tryConnect()
		restartRestApi()

		let trayImagePath = path.join(__dirname, '../assets', 'tray.png')
		let trayImageOfflinePath = path.join(__dirname, '../assets', 'tray-offline.png')
		switch (process.platform) {
			case 'darwin':
				trayImagePath = path.join(__dirname, '../assets', 'trayTemplate.png')
				trayImageOfflinePath = path.join(__dirname, '../assets', 'trayOfflineTemplate.png')
				break
			case 'win32':
				trayImagePath = path.join(__dirname, '../assets', 'tray.ico')
				trayImageOfflinePath = path.join(__dirname, '../assets', 'tray-offline.ico')
				break
		}
		const trayImage = nativeImage.createFromPath(trayImagePath)
		const trayImageOffline = nativeImage.createFromPath(trayImageOfflinePath)

		tray = new Tray(trayImageOffline)

		client.on('connected', () => {
			tray?.setImage(trayImage)
		})
		client.on('disconnected', () => {
			tray?.setImage(trayImageOffline)
		})

		updateTray()
	})
	.catch((e) => {
		dialog.showErrorBox(`Startup error`, `Failed to launch: ${e}`)
	})

function changeHost() {
	const current = store.get('remoteIp')
	prompt({
		title: 'Companion IP address',
		label: 'IP',
		value: current ?? '127.0.0.1',
		inputAttrs: {},
		type: 'input',
	})
		.then((r) => {
			if (r === null) {
				console.log('user cancelled')
			} else {
				console.log('new ip', r)
				store.set('remoteIp', r)
				tryConnect()
			}
		})
		.catch((e) => {
			console.error('Failed to change host', e)
		})
}
function changePort() {
	const current = store.get('remotePort')
	prompt({
		title: 'Companion Satellite Port Number',
		label: 'Port',
		value: `${current ?? DEFAULT_PORT}`,
		inputAttrs: {},
		type: 'input',
	})
		.then((r) => {
			if (r === null) {
				console.log('user cancelled')
			} else {
				const r2 = Number(r)
				console.log('new port', r2)
				if (!isNaN(r2)) {
					store.set('remotePort', r)
					tryConnect()
				}
			}
		})
		.catch((e) => {
			console.error('Failed to change port', e)
		})
}
function changeRestPort() {
	const current = store.get('restPort')
	prompt({
		title: 'Companion Satellite API Port Number',
		label: 'API Port',
		value: `${current ?? DEFAULT_REST_PORT}`,
		inputAttrs: {},
		type: 'input',
	})
		.then((r) => {
			if (r === null) {
				console.log('user cancelled')
			} else {
				const r2 = Number(r)
				console.log('new rest port', r2)
				if (!isNaN(r2)) {
					store.set('restPort', r)
					restartRestApi()
				}
			}
		})
		.catch((e) => {
			console.error('Failed to change hrest port', e)
		})
}
function toggleRestApi() {
	const current = store.get('restEnabled')
	store.set('restEnabled', !current)

	restartRestApi()

	updateTray()
}

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
				await Promise.allSettled([
					// cleanup
					client.disconnect(),
					devices.close(),
				])
				app.quit()
			}
		})
		.catch((e) => {
			console.error('Failed to do quit', e)
		})
}

function trayScanDevices() {
	console.log('do scan')
	devices.scanDevices()
}

function trayAbout() {
	console.log('about click')
	openAboutWindow({
		icon_path: path.join(__dirname, '../assets', 'icon.png'),
		product_name: 'Companion Satellite',
		use_inner_html: true,
		description: 'Satellite Streamdeck connector for Bitfocus Companion <br />Supports 2.2.0 and newer',
		adjust_window_size: false,
		win_options: {
			resizable: false,
		},
		bug_report_url: 'https://github.com/bitfocus/companion-satellite/issues',
		copyright: '2023 Julian Waller',
		homepage: 'https://github.com/bitfocus/companion-satellite',
		license: 'MIT',
		use_version_info: true,
	})
}
