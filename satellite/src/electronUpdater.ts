import { MenuItem, app, dialog, Notification } from 'electron'
import electronUpdater from 'electron-updater'
import { createRequire } from 'module'

const { autoUpdater } = electronUpdater

// For development testing
// autoUpdater.forceDevUpdateConfig = true

const require = createRequire(import.meta.url)
const pkgJson = require('../package.json')
const updateChannel: string | undefined = app.isPackaged ? pkgJson.updateChannel : 'beta'

// Configure the updater
autoUpdater.setFeedURL({
	provider: 'generic',
	publishAutoUpdate: false,
	url: 'https://api.bitfocus.io/v1/product/electron-updater/companion-satellite',
})
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true
autoUpdater.autoRunAppAfterInstall = true
autoUpdater.requestHeaders = { 'User-Agent': `Companion Satellite v${autoUpdater.currentVersion}` }
autoUpdater.channel = updateChannel ?? '' // TODO - this will likely want to vary for each macos arch..

export function isUpdateSupported(): boolean {
	return (
		!!updateChannel &&
		process.platform === 'win32' /*|| process.platform === 'darwin')*/ && // HACK: disable for macos for now
		autoUpdater.isUpdaterActive()
	)
}

export class ElectronUpdater {
	readonly menuItem: MenuItem
	#updateNotification: Notification | undefined

	constructor() {
		this.menuItem = new MenuItem({
			label: 'Check for updates',
			visible: isUpdateSupported(),
			click: () => this.check(true),
		})
	}

	installPending(): void {
		autoUpdater
			.downloadUpdate()
			.then(() => {
				autoUpdater.quitAndInstall()
			})
			.catch((e) => {
				dialog.showErrorBox(
					'Install update failed',
					'Failed to download update.\nTry again later, or try installing the update manually.',
				)
				console.log('failed to download', e)
			})
	}

	check(notifyWithDialog = false): void {
		if (!isUpdateSupported()) return

		autoUpdater
			.checkForUpdates()
			.then((info) => {
				if (notifyWithDialog) {
					if (info) {
						dialog
							.showMessageBox({
								title: 'Companion Satellite',
								message: `Version ${info.updateInfo.version} is available`,
								buttons: ['Install', 'Cancel'],
							})
							.then((v) => {
								if (v.response === 0) {
									this.installPending()
								}
							})
							.catch((e) => {
								console.error('dialog error', e)
							})
					} else {
						dialog
							.showMessageBox({
								title: 'Companion Satellite',
								message: 'No update is available',
								buttons: ['Close'],
							})
							.catch((e) => {
								console.error('dialog error', e)
							})
					}
				} else {
					// Show a system notification instead
					if (info) {
						if (!this.#updateNotification) {
							this.#updateNotification = new Notification({
								title: 'An update is available',
								body: ``,
							})
						}
						this.#updateNotification.body = `Version ${info.updateInfo.version} is available to be installed`
						this.#updateNotification.show()
					}
				}
			})
			.catch((e) => {
				console.error('Failed to check for updates', e)
			})
	}
}
