import { $, usePowerShell } from 'zx'
import { fetchBuiltinSurfaceModules } from './fetch_builtin_modules.mts'
import { fetchNodejs, currentPlatformInfo } from './fetch_nodejs.mts'

if (process.platform === 'win32') {
	usePowerShell() // to enable powershell
}

console.log('Ensuring nodejs binaries are available')
await fetchNodejs(currentPlatformInfo())

console.log('Ensuring builtin modules are installed')
await fetchBuiltinSurfaceModules()

console.log('Building satellite')
await $`yarn run build:ts`
