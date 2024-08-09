import type Conf from 'conf'
import type { SatelliteConfig } from './config.js'
import { Bonjour, Service } from '@julusian/bonjour-service'
import os from 'os'
import debounceFn from 'debounce-fn'

export class MdnsAnnouncer {
	readonly #appConfig: Conf<SatelliteConfig>
	readonly #bonjour = new Bonjour()

	#bonjourService: Service | null = null

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

	start() {
		if (!this.#appConfig.get('mdnsEnabled')) return
		if (this.#bonjourService) return

		try {
			const restEnabled = this.#appConfig.get('restEnabled')
			const restPort = this.#appConfig.get('restPort')
			const installationName = this.#appConfig.get('installationName') || os.hostname() || 'Unnamed Satellite'

			this.#bonjourService = this.#bonjour.publish(
				{
					name: installationName,
					type: 'companion-satellite',
					protocol: 'tcp',
					port: restPort || 9999,
					txt: {
						restEnabled: restEnabled,
					},
					ttl: 150,
				},
				{
					announceOnInterval: 60 * 1000,
				},
			)
		} catch (e) {
			console.error('Failed to setup mdns publisher', e)
		}
	}

	stop() {
		if (this.#bonjourService) {
			this.#bonjourService.stop?.()
			this.#bonjourService = null
		}
	}
}
