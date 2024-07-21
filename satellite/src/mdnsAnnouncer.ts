import type Conf from 'conf'
import type { SatelliteConfig } from './config.js'
import { Bonjour, Service } from '@julusian/bonjour-service'
import os from 'os'

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

			this.#bonjourService = this.#bonjour.publish(
				{
					// TODO - this name needs to be unique for each installation
					name: os.hostname(), // TODO - something customisable?
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
