import pino from 'pino'

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

export async function flushLogger(): Promise<void> {
	return new Promise((resolve) => {
		logger.flush(() => {
			resolve()
		})
	})
}
