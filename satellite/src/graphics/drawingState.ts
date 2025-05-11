import { ImageWriteQueue } from './writeQueue.js'

export class DrawingState<TKey extends number | string> {
	#queue: ImageWriteQueue<TKey>
	#state: string

	#isAborting = false
	#execBeforeRunQueue: (() => Promise<void>) | null = null

	get state(): string {
		return this.#state
	}

	constructor(state: string) {
		this.#state = state
		this.#queue = new ImageWriteQueue()
	}

	queueJob(key: TKey, fn: (key: TKey, signal: AbortSignal) => Promise<void>): void {
		this.#queue.queue(key, fn)
	}

	abortQueued(newState: string, fnBeforeRunQueue?: () => Promise<void>): void {
		let abortQueue: ImageWriteQueue<TKey> | null = null
		if (!this.#isAborting) {
			this.#isAborting = true
			abortQueue = this.#queue
		}

		console.log(`Aborting queue: ${this.#state} -> ${newState}`, !!abortQueue)

		this.#state = newState
		this.#queue = new ImageWriteQueue(false)
		this.#execBeforeRunQueue = fnBeforeRunQueue ?? null

		if (abortQueue) {
			abortQueue
				.abort()
				.catch((e) => {
					console.error(`Failed to abort queue: ${e}`)
				})
				.then(async () => {
					if (this.#execBeforeRunQueue) {
						await this.#execBeforeRunQueue().catch((e) => {
							console.error(`Failed to run before queue: ${e}`)
						})
						this.#execBeforeRunQueue = null
					}
				})
				.finally(() => {
					this.#isAborting = false

					console.log('aborted')

					// Start execution
					this.#queue.setRunning()
				})
				.catch((e) => {
					console.error(`Failed to abort queue: ${e}`)
				})
		}
	}
}
