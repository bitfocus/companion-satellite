import type Conf from 'conf'
import type { SatelliteConfig } from './config.js'
import { Bonjour, Service } from '@julusian/bonjour-service'

export class MdnsAnnouncer {
	readonly #appConfig: Conf<SatelliteConfig>
	readonly #bonjour = new Bonjour()

	#bonjourService: Service | null = null

	constructor(appConfig: Conf<SatelliteConfig>) {
		this.#appConfig = appConfig

		this.#appConfig.onDidChange('mdnsEnabled', () => this.restart())
		this.#appConfig.onDidChange('restPort', () => this.restart())
		this.#appConfig.onDidChange('restEnabled', () => this.restart())
	}

	restart() {
		this.stop()
		this.start()
	}

	start() {
		if (!this.#appConfig.get('mdnsEnabled')) return
		if (this.#bonjourService) return

		try {
			const restEnabled = this.#appConfig.get('restEnabled')
			const restPort = this.#appConfig.get('restPort')

			this.#bonjourService = this.#bonjour.publish({
				name: 'Companion Satellite', // TODO - something customisable?
				type: 'companion-satellite',
				protocol: 'tcp',
				port: this.#appConfig.get('restPort') || 9999,
				txt: {
					restEnabled: restEnabled,
					restPort: restPort,
				},
			})
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
