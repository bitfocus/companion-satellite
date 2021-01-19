// eslint-disable-next-line node/no-unpublished-import
import { app, Tray, Menu, MenuItem, dialog } from 'electron'
import * as path from 'path'
import { init } from './app'
import * as electronStore from 'electron-store'
import * as prompt from 'electron-prompt'

const store = new electronStore<RemoteConfig>()

interface RemoteConfig {
	remoteIp: string
}

const client = init()
let tray: Tray | undefined

app.whenReady().then(function () {
	console.log('App ready')

	const ip = store.get('remoteIp')
	if (ip) {
		client.connect(ip)
	}

	tray = new Tray(
		process.platform == 'darwin'
			? path.join(__dirname, '../assets', 'trayTemplate.png')
			: path.join(__dirname, '../assets', 'icon.png')
	)
	// tray.setIgnoreDoubleClickEvents(true)
	// if (process.platform !== 'darwin') {
	// 	tray.on('click', toggleWindow)
	// }

	const menu = new Menu()
	// menu.append(
	// 	new electron.MenuItem({
	// 		label: 'Show/Hide window',
	// 		click: toggleWindow,
	// 	})
	// )
	// menu.append(
	// 	new electron.MenuItem({
	// 		label: 'Launch GUI',
	// 		click: launchUI,
	// 	})
	// )
	menu.append(
		new MenuItem({
			label: 'Change Host',
			click: changeHost,
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
	}).then((r) => {
		if (r === null) {
			console.log('user cancelled')
		} else {
			console.log('result', r)
			store.set('remoteIp', r)
			client.connect(r)
		}
	})
}

function trayQuit() {
	console.log('quit click')
	dialog
		.showMessageBox({
			title: 'Companion Remote',
			message: 'Are you sure you want to quit Companion Remote?',
			buttons: ['Quit', 'Cancel'],
		})
		.then((v) => {
			console.log('quit: ', v.response)
			if (v.response === 0) {
				app.quit()
			}
		})
}

client
