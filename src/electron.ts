import electronStore from 'electron-store'
import prompt from 'electron-prompt'
import { DeviceManager } from './devices.js'
import { CompanionSatelliteClient } from './client.js'
import { DEFAULT_PORT } from './lib.js'
import { fileURLToPath } from 'url'

import { createRequire } from 'module'
const require = createRequire(import.meta.url)

// Hack to resolve import not working correctly..
const openAboutWindow: typeof import('electron-about-window')['default'] = require('electron-about-window').default
const electron: typeof import('electron') = require('electron')

const store = new electronStore<SatelliteConfig>()
let tray: import('electron').Tray | undefined

electron.app.on('window-all-closed', () => {
	// Block default behaviour of exit on close
})

interface SatelliteConfig {
	remoteIp: string
	remotePort: number
}

console.log('Starting')

const client = new CompanionSatelliteClient({ debug: true })
const devices = new DeviceManager(client)

client.on('log', (l) => console.log(l))
client.on('error', (e) => console.error(e))

function tryConnect() {
	const ip = store.get('remoteIp')
	const port = store.get('remotePort') ?? DEFAULT_PORT
	if (ip) {
		client.connect(ip, port)
	}
}

electron.app.whenReady().then(function () {
	console.log('App ready')

	tryConnect()

	tray = new electron.Tray(
		fileURLToPath(
			process.platform == 'darwin'
				? new URL('../assets/trayTemplate.png', import.meta.url)
				: new URL('../assets/icon.png', import.meta.url)
		)
	)

	const menu = new electron.Menu()
	menu.append(
		new electron.MenuItem({
			label: 'Change Host',
			click: changeHost,
		})
	)
	menu.append(
		new electron.MenuItem({
			label: 'Change Port',
			click: changePort,
		})
	)
	menu.append(
		new electron.MenuItem({
			label: 'Scan devices',
			click: trayScanDevices,
		})
	)
	menu.append(
		new electron.MenuItem({
			label: 'About',
			click: trayAbout,
		})
	)
	menu.append(
		new electron.MenuItem({
			label: 'Quit',
			click: trayQuit,
		})
	)
	console.log('set tray')
	tray.setContextMenu(menu)
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
			console.error('Failed to change host', e)
		})
}

function trayQuit() {
	console.log('quit click')
	electron.dialog
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
				electron.app.quit()
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
	console.log('about click', openAboutWindow)
	openAboutWindow({
		icon_path: fileURLToPath(new URL('../assets/icon.png', import.meta.url)),
		product_name: 'Companion Satellite',
		use_inner_html: true,
		description: 'Satellite Streamdeck connector for Bitfocus Companion <br />Supports 2.2.0 and newer',
		adjust_window_size: false,
		win_options: {
			resizable: false,
		},
		bug_report_url: 'https://github.com/bitfocus/companion-satellite/issues',
		copyright: '2021 Julian Waller',
		homepage: 'https://github.com/bitfocus/companion-satellite',
		license: 'MIT',
		use_version_info: true,
	})
}
