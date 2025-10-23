import { registerLoggingSink } from '@companion-surface/host'
import pino from 'pino'
import { assertNever } from './lib.js'

export type Logger = pino.Logger

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

registerLoggingSink((source, level, message) => {
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
