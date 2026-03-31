import { usePowerShell } from 'zx'
import { fetchBuiltinSurfaceModules } from './fetch_builtin_modules.mts'

if (process.platform === 'win32') {
	usePowerShell() // to enable powershell
}

// console.log('Ensuring nodejs binaries are available')

// const platformInfo = determinePlatformInfo(undefined)
// await fetchNodejs(platformInfo)

console.log('Ensuring builtin modules are installed')

await fetchBuiltinSurfaceModules()
