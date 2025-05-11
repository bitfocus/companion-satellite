/*
 * This file is part of the Companion project
 * Copyright (c) 2018 Bitfocus AS
 * Authors: William Viker <william@bitfocus.io>, Håkon Nessjøen <haakon@bitfocus.io>
 *
 * This program is free software.
 * You should have received a copy of the MIT licence as well as the Bitfocus
 * Individual Contributor License Agreement for companion along with
 * this program.
 */

interface DrainPromise {
	promise: Promise<void>
	resolve: () => void
}

export class ImageWriteQueue<TKey extends number | string> {
	private readonly maxConcurrent = 3
	private readonly pendingImages: Array<{ key: TKey; fn: (key: TKey, signal: AbortSignal) => Promise<void> }> = []
	private readonly drainAbort = new AbortController()
	private readonly inProgress = new Set<TKey>()
	private drainPromise: DrainPromise | null = null

	#running: boolean

	get running(): boolean {
		return this.#running
	}

	constructor(autostart = true) {
		this.#running = autostart
	}

	public setRunning(): void {
		if (this.drainAbort.signal.aborted) throw new Error('queue is aborted')

		this.#running = true

		this.tryDequeue()
	}

	public async abort(): Promise<void> {
		this.pendingImages.splice(0, this.pendingImages.length)
		this.drainAbort.abort()

		if (!this.drainPromise && this.inProgress.size > 0) {
			let resolve = () => {}
			const promise = new Promise<void>((resolve_) => {
				resolve = resolve_
			})
			this.drainPromise = {
				resolve,
				promise,
			}
		}

		if (this.drainPromise) await this.drainPromise.promise
	}

	public queue(key: TKey, fn: (key: TKey, signal: AbortSignal) => Promise<void>): void {
		if (this.drainAbort.signal.aborted) throw new Error('queue is aborted')

		let updated = false
		// Try and replace an existing queued image first
		for (const img of this.pendingImages) {
			if (img.key === key) {
				img.fn = fn
				updated = true
				break
			}
		}

		// If key isnt queued, then append
		if (!updated) {
			this.pendingImages.push({ key: key, fn: fn })
		}

		this.tryDequeue()
	}

	private tryDequeue() {
		if (!this.#running) return

		// Start another if not too many in progress
		if (this.inProgress.size < this.maxConcurrent && this.pendingImages.length > 0) {
			// Find first image where key is not being worked on
			const nextImageIndex = this.pendingImages.findIndex((img) => !this.inProgress.has(img.key))
			if (nextImageIndex === -1) {
				return
			}

			const nextImage = this.pendingImages[nextImageIndex]
			this.pendingImages.splice(nextImageIndex, 1)
			if (!nextImage) {
				return
			}

			// Track which key is being processed
			this.inProgress.add(nextImage.key)

			nextImage
				.fn(nextImage.key, this.drainAbort.signal)
				.catch((e) => {
					// Ensure it doesnt error out
					console.error('fillImage error:', e)
				})
				.finally(() => {
					// Stop tracking key
					this.inProgress.delete(nextImage.key)

					if (this.inProgress.size === 0 && this.drainPromise) {
						try {
							const resolve = this.drainPromise.resolve
							this.drainPromise = null
							resolve()
						} catch (e) {
							console.error('drain promise error:', e)
						}
					}

					if (this.drainAbort.signal.aborted) return

					// Run again
					setImmediate(() => this.tryDequeue())
				})
		}
	}
}
