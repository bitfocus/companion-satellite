import { registerLoggingSink } from '@companion-surface/host'
import pino from 'pino'
import { assertNever } from './lib.js'

export type Logger = pino.Logger

// Track whether the logger is still active (worker thread not exited)
let loggerActive = true

export const logger = pino({
	transport: {
		target: 'pino-pretty',
		options: {
			colorize: true,
			translateTime: 'yyyy-mm-dd HH:MM:ss',
			ignore: 'pid,hostname',
		},
		level: process.env.LOG_LEVEL || 'debug',
	},
})

export function createLogger(name: string): Logger {
	return logger.child({ name })
}

/**
 * Safely log a message, catching errors if the logger worker has exited.
 * This is used during shutdown when the pino-pretty worker may have already terminated.
 */
function safeLog(fn: () => void): void {
	if (!loggerActive) return
	try {
		fn()
	} catch (e) {
		// Worker has likely exited, disable further logging attempts
		if (e instanceof Error && e.message.includes('worker has exited')) {
			loggerActive = false
		}
	}
}

/**
 * Flush and close the logger. Call this before application exit to ensure
 * all logs are written and the worker thread is properly closed.
 */
export async function closeLogger(): Promise<void> {
	loggerActive = false
	// Give a small delay for any pending logs to be written
	await new Promise((resolve) => setTimeout(resolve, 100))
}

registerLoggingSink((source, level, message) => {
	safeLog(() => {
		switch (level) {
			case 'debug':
				logger.debug({ name: source }, message)
				break
			case 'info':
				logger.info({ name: source }, message)
				break
			case 'warn':
				logger.warn({ name: source }, message)
				break
			case 'error':
				logger.error({ name: source }, message)
				break
			default:
				assertNever(level)
				logger.info({ name: source }, message)
				break
		}
	})
})
