import { EventEmitter } from 'events'
import type { AppInfo } from '../appInfo.js'
import type { SatelliteConfigInstance } from '../config.js'
import type { ApiUpdateInfo } from '../apiTypes.js'
import { createLogger } from '../logging.js'
import { compileUpdatesApiBody, createUpdatesApiClient, runWithRetry } from './api.js'
import type { Client } from '../generated/CompanionUpdates/client/index.js'
import { updatesPost, type UpdatesPostResponse } from '../generated/CompanionUpdates/index.js'

const REQUEST_TIMEOUT_MS = 10_000
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

export type UpdateCheckerEvents = {
	/** The update info has changed */
	info: [info: ApiUpdateInfo | null]
}

type LatestInfo =
	Omit<Extract<ApiUpdateInfo, { type: 'update' }>, 'dismissed'> | Extract<ApiUpdateInfo, { type: 'beta' | 'info' }>

export class UpdateChecker extends EventEmitter<UpdateCheckerEvents> {
	readonly #logger = createLogger('UpdateChecker')

	readonly #appInfo: AppInfo
	readonly #appConfig: SatelliteConfigInstance
	readonly #apiClient: Client

	#latest: LatestInfo | null = null
	#interval: NodeJS.Timeout | undefined
	#abortRetry: (() => void) | undefined

	constructor(appInfo: AppInfo, appConfig: SatelliteConfigInstance) {
		super()

		this.#appInfo = appInfo
		this.#appConfig = appConfig
		this.#apiClient = createUpdatesApiClient(appInfo)
	}

	start(): void {
		if (!this.#appInfo.isOfficialBuild) {
			this.#logger.info('Not an official build, skipping update checks')
			return
		}

		this.#check()
		// Check every day, in case this installation is being left on constantly
		this.#interval = setInterval(() => this.#check(), CHECK_INTERVAL_MS)
	}

	stop(): void {
		clearInterval(this.#interval)
		this.#interval = undefined
		this.#abortRetry?.()
	}

	/**
	 * The latest update info, or null if there is no message to show
	 */
	getInfo(): ApiUpdateInfo | null {
		if (!this.#latest) return null
		if (this.#latest.type !== 'update') return this.#latest

		return {
			...this.#latest,
			dismissed: this.#appConfig.get('dismissedUpdateVersion') === this.#latest.version,
		}
	}

	/**
	 * Dismiss the notice for the available update, so that it doesn't get shown prominently again.
	 * A newer version will be shown as normal
	 */
	dismiss(): void {
		if (this.#latest?.type !== 'update') return

		this.#appConfig.set('dismissedUpdateVersion', this.#latest.version)

		this.emit('info', this.getInfo())
	}

	#check(): void {
		this.#abortRetry?.()
		this.#abortRetry = runWithRetry('update check', async () => {
			const { data: res } = await updatesPost({
				client: this.#apiClient,
				body: compileUpdatesApiBody(this.#appInfo, this.#appConfig.get('machineId')),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				// Any failure should be retried, so throw rather than reporting errors in the result
				throwOnError: true,
			})

			// The server asked us to try again later
			if (!res.ok) throw new Error('Update server is not ready')

			this.#logger.debug(`Update check result: ${JSON.stringify(res)}`)

			this.#latest = parseResponse(res)

			this.emit('info', this.getInfo())
		})
	}
}

function parseResponse(res: UpdatesPostResponse): LatestInfo | null {
	const common = { message: res.message, message2: res.message2, link: res.link }

	switch (res.type) {
		case 'update':
			return { ...common, type: 'update', version: res.version }
		case 'beta':
		case 'info':
			return res.message ? { ...common, type: res.type } : null
		case 'none':
			return null
		default:
			// A type added to the server since this was built, which we can't present sensibly
			return null
	}
}
