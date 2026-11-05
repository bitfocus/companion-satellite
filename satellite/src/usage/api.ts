import os from 'os'
import type { AppInfo } from '../appInfo.js'
import { createLogger } from '../logging.js'
import { createClient, createConfig, type Client } from '../generated/CompanionUpdates/client/index.js'
import type { UpdatesPostData } from '../generated/CompanionUpdates/index.js'

const BASE_URL = 'https://updates.companion.free'

const RETRY_COUNT = 2
const RETRY_DELAY_MS = 5 * 60 * 1000

const logger = createLogger('UpdatesApi')

export type UpdatesApiBody = UpdatesPostData['body']

export function createUpdatesApiClient(appInfo: AppInfo): Client {
	return createClient(
		createConfig({
			baseUrl: BASE_URL,
			headers: {
				'User-Agent': `Companion Satellite ${appInfo.build}`,
			},
		}),
	)
}

export function compileUpdatesApiBody(appInfo: AppInfo, machineId: string): UpdatesApiBody {
	return {
		id: machineId,
		app: {
			name: 'satellite',
			version: appInfo.version,
			build: appInfo.build,
		},
		os: {
			platform: os.platform(),
			arch: os.arch(),
			release: os.release(),
		},
	}
}

/**
 * Run a request, retrying a couple of times with a long delay if it fails.
 * Returns a function to abort any pending retry
 */
export function runWithRetry(name: string, fn: () => Promise<void>): () => void {
	let retryTimeout: NodeJS.Timeout | undefined
	let aborted = false

	const attempt = (remaining: number) => {
		fn().catch((e) => {
			if (aborted) return

			if (remaining > 0) {
				logger.debug(`${name} failed, will retry: ${e}`)
				retryTimeout = setTimeout(() => attempt(remaining - 1), RETRY_DELAY_MS)
			} else {
				logger.warn(`All ${name} attempts failed: ${e}`)
			}
		})
	}
	attempt(RETRY_COUNT)

	return () => {
		aborted = true
		clearTimeout(retryTimeout)
	}
}
