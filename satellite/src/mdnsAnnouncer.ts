import type Conf from 'conf'
import type { SatelliteConfig } from './config.js'
import { Bonjour, Service } from '@julusian/bonjour-service'
import os from 'os'
import debounceFn from 'debounce-fn'

/**
 * Service types to announce as.
 * `companion-satellite` is longer than the 15 character limit for mdns service types, so is being replaced by `comp-sat-app`
 * TODO: drop the legacy `companion-satellite` type once enough Companion versions browse for `comp-sat-app`
 */
const SERVICE_TYPES: { type: string; legacy: boolean }[] = [
	{ type: 'comp-sat-app', legacy: false },
	{ type: 'companion-satellite', legacy: true },
]

export class MdnsAnnouncer {
	readonly #appConfig: Conf<SatelliteConfig>
	readonly #bonjour = new Bonjour()

	#bonjourServices: Service[] = []

	constructor(appConfig: Conf<SatelliteConfig>) {
		this.#appConfig = appConfig

		this.#appConfig.onDidChange('mdnsEnabled', () => this.#restart())
		this.#appConfig.onDidChange('installationName', () => this.#restart())
		this.#appConfig.onDidChange('restPort', () => this.#restart())
		this.#appConfig.onDidChange('restEnabled', () => this.#restart())
	}

	readonly #restart = debounceFn(
		() => {
			this.stop()
			this.start()
		},
		{
			wait: 50,
			before: false,
			after: true,
		},
	)

	start(): void {
		if (!this.#appConfig.get('mdnsEnabled')) return
		if (this.#bonjourServices.length > 0) return

		const restEnabled = this.#appConfig.get('restEnabled')
		const restPort = this.#appConfig.get('restPort')
		const installationName = this.#appConfig.get('installationName') || os.hostname() || 'Unnamed Satellite'

		for (const { type, legacy } of SERVICE_TYPES) {
			try {
				this.#bonjourServices.push(
					this.#bonjour.publish(
						{
							name: installationName,
							type,
							protocol: 'tcp',
							port: restPort || 9999,
							txt: {
								restEnabled: restEnabled,
							},
							ttl: 150,
							allowInvalidType: legacy,
						},
						{
							announceOnInterval: 60 * 1000,
						},
					),
				)
			} catch (e) {
				console.error(`Failed to setup mdns publisher for ${type}`, e)
			}
		}
	}

	stop(): void {
		for (const service of this.#bonjourServices) {
			service.stop?.()
		}
		this.#bonjourServices = []
	}
}
