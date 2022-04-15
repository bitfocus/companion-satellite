// Electron doesn't support ESM main files, so we need to use this file to be our conversion point
;(async function () {
	try {
		// Pass electron as a parameter as it can't be imported in esm files
		await import('./dist/electron.js')
	} catch (e) {
		console.error(`Failed to start: ${e}`)
		process.exit(1)
	}
})()
