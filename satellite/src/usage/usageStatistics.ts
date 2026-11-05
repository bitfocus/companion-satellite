import type { AppInfo } from '../appInfo.js'
import type { CompanionSatelliteClient } from '../client/client.js'
import type { SatelliteConfigInstance } from '../config.js'
import type { SurfaceManager } from '../surface-manager.js'
import { createLogger } from '../logging.js'
import { compileUpdatesApiBody, createUpdatesApiClient, runWithRetry } from './api.js'
import type { Client } from '../generated/CompanionUpdates/client/index.js'
import { satelliteDetailedUsagePost, type SatelliteDetailedUsagePostData } from '../generated/CompanionUpdates/index.js'

const REQUEST_TIMEOUT_MS = 20_000
const STARTUP_DELAY_MS = 2 * 60 * 1000
const REPORT_INTERVAL_MS = 60 * 60 * 1000

export type UsageStatisticsPayload = SatelliteDetailedUsagePostData['body']

export class UsageStatistics {
	readonly #logger = createLogger('UsageStatistics')

	readonly #appInfo: AppInfo
	readonly #appConfig: SatelliteConfigInstance
	readonly #client: CompanionSatelliteClient
	readonly #surfaceManager: SurfaceManager
	readonly #apiClient: Client

	#cycleStop: (() => void) | undefined

	constructor(
		appInfo: AppInfo,
		appConfig: SatelliteConfigInstance,
		client: CompanionSatelliteClient,
		surfaceManager: SurfaceManager,
	) {
		this.#appInfo = appInfo
		this.#appConfig = appConfig
		this.#client = client
		this.#surfaceManager = surfaceManager
		this.#apiClient = createUpdatesApiClient(appInfo)

		this.#appConfig.onDidChange('detailedUsageEnabled', () => this.startStop())
	}

	/**
	 * Build the current usage payload
	 */
	buildPayload(): UsageStatisticsPayload {
		const enabledPlugins = this.#appConfig.get('surfacePluginsEnabled') ?? {}

		const surfaceCounts = new Map<string, number>()
		for (const surface of this.#surfaceManager.getOpenSurfacesInfo()) {
			surfaceCounts.set(surface.pluginId, (surfaceCounts.get(surface.pluginId) ?? 0) + 1)
		}

		return {
			...compileUpdatesApiBody(this.#appInfo, this.#appConfig.get('machineId')),
			uptime: process.uptime(),

			surfacePlugins: this.#surfaceManager.getAvailablePluginsInfo().map((plugin) => ({
				moduleId: plugin.pluginId,
				version: plugin.version,
				enabled: !!enabledPlugins[plugin.pluginId],
				connectedSurfaces: surfaceCounts.get(plugin.pluginId) ?? 0,
			})),

			features: {
				distribution: this.#appInfo.distribution,
				remoteProtocol: this.#appConfig.get('remoteProtocol'),

				connected: this.#client.connected,
				companionVersion: this.#client.companionVersion ?? undefined,
				companionApiVersion: this.#client.companionApiVersion ?? undefined,

				restEnabled: !!this.#appConfig.get('restEnabled'),
				mdnsEnabled: !!this.#appConfig.get('mdnsEnabled'),
			},
		}
	}

	/**
	 * Start or stop the reporting cycle, to match the config
	 */
	startStop(): void {
		this.stop()

		if (!this.#appInfo.isOfficialBuild) {
			this.#logger.info('Not an official build, skipping usage statistics')
			return
		}

		if (!this.#appConfig.get('detailedUsageEnabled')) {
			this.#logger.info('Usage statistics are disabled')
			return
		}

		this.#logger.info('Starting usage statistics cycle')

		let abortRetry: (() => void) | undefined
		const report = () => {
			abortRetry?.()
			abortRetry = runWithRetry('usage statistics report', async () => this.#report())
		}

		// Give the system a chance to start up, then report every hour
		const timeout = setTimeout(report, STARTUP_DELAY_MS)
		const interval = setInterval(report, REPORT_INTERVAL_MS)

		this.#cycleStop = () => {
			clearTimeout(timeout)
			clearInterval(interval)
			abortRetry?.()
			this.#cycleStop = undefined
		}
	}

	stop(): void {
		this.#cycleStop?.()
	}

	async #report(): Promise<void> {
		const { data: res } = await satelliteDetailedUsagePost({
			client: this.#apiClient,
			body: this.buildPayload(),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			// Any failure should be retried, so throw rather than reporting errors in the result
			throwOnError: true,
		})
		if (!res.ok) throw new Error('Update server did not accept usage statistics')

		this.#logger.debug('Usage statistics reported')
	}
}
