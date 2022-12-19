// eslint-disable-next-line node/no-unpublished-import
import { app, Tray, Menu, MenuItem, dialog } from 'electron'
import * as path from 'path'
// eslint-disable-next-line node/no-unpublished-import
import * as electronStore from 'electron-store'
// eslint-disable-next-line node/no-unpublished-import
import * as prompt from 'electron-prompt'
// eslint-disable-next-line node/no-unpublished-import
import openAboutWindow from 'electron-about-window'
import { DeviceManager } from './devices'
import { CompanionSatelliteClient } from './client'
import { DEFAULT_PORT } from './lib'

const store = new electronStore<SatelliteConfig>()
let tray: Tray | undefined

app.on('window-all-closed', () => {
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

app.whenReady().then(function () {
	console.log('App ready')

	tryConnect()

	tray = new Tray(
		process.platform == 'darwin'
			? path.join(__dirname, '../assets', 'trayTemplate.png')
			: path.join(__dirname, '../assets', 'icon.png')
	)

	const menu = new Menu()
	menu.append(
		new MenuItem({
			label: 'Change Host',
			click: changeHost,
		})
	)
	menu.append(
		new MenuItem({
			label: 'Change Port',
			click: changePort,
		})
	)
	menu.append(
		new MenuItem({
			label: 'Scan devices',
			click: trayScanDevices,
		})
	)
	menu.append(
		new MenuItem({
			label: 'About',
			click: trayAbout,
		})
	)
	menu.append(
		new MenuItem({
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
