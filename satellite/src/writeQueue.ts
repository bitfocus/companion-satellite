/*
 * This file is part of the Companion project
 * Copyright (c) 2018 Bitfocus AS
 * Authors: William Viker <william@bitfocus.io>, Håkon Nessjøen <haakon@bitfocus.io>
 *
 * This program is free software.
 * You should have received a copy of the MIT licence as well as the Bitfocus
 * Individual Contributor License Agreement for companion along with
 * this program.
 *
 * You can be released from the requirements of the license by purchasing
 * a commercial license. Buying such a license is mandatory as soon as you
 * develop commercial activities involving the Companion software without
 * disclosing the source code of your own applications.
 *
 */

interface DrainPromise {
	promise: Promise<void>
	resolve: () => void
}

export class ImageWriteQueue<TArgs extends unknown[] = [buffer: Buffer]> {
	private readonly maxConcurrent = 3
	private readonly pendingImages: Array<{ key: number; args: TArgs }> = []
	private inProgress = new Map<number, AbortController>()
	private drainPromise: DrainPromise | null = null

	#running: boolean

	get running(): boolean {
		return this.#running
	}

	constructor(
		private readonly fillImage: (key: number, signal: AbortSignal, ...args: TArgs) => Promise<void>,
		autostart = true,
	) {
		this.#running = autostart
	}

	public setRunning(): void {
		this.#running = true

		this.tryDequeue()
	}

	public async abort(): Promise<void> {
		this.pendingImages.splice(0, this.pendingImages.length)
		for (const o of this.inProgress.values()) {
			o.abort()
		}

		if (!this.drainPromise) {
			let resolve = () => {}
			const promise = new Promise<void>((resolve_) => {
				resolve = resolve_
			})
			this.drainPromise = {
				resolve,
				promise,
			}
		}
		await this.drainPromise.promise
	}

	public queue(key: number, ...args: TArgs): void {
		let updated = false
		// Try and replace an existing queued image first
		for (const img of this.pendingImages) {
			if (img.key === key) {
				img.args = args
				updated = true
				break
			}
		}

		// If key isnt queued, then append
		if (!updated) {
			this.pendingImages.push({ key: key, args: args })
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
			const abortController = new AbortController()
			this.inProgress.set(nextImage.key, abortController)

			this.fillImage(nextImage.key, abortController.signal, ...nextImage.args)
				.catch((e) => {
					// Ensure it doesnt error out
					console.error('fillImage error:', e)
				})
				.finally(() => {
					// Stop tracking key
					this.inProgress.delete(nextImage.key)

					// Run again
					setImmediate(() => {
						this.tryDequeue()
					})
				})
		}
	}
}

export class ImageWriteQueue2<TKey extends number | string> {
	private readonly maxConcurrent = 3
	private readonly pendingImages: Array<{ key: TKey; fn: (key: TKey, signal: AbortSignal) => Promise<void> }> = []
	private inProgress = new Map<TKey, AbortController>()
	private drainPromise: DrainPromise | null = null

	#running: boolean

	get running(): boolean {
		return this.#running
	}

	constructor(autostart = true) {
		this.#running = autostart
	}

	public setRunning(): void {
		this.#running = true

		this.tryDequeue()
	}

	public async abort(): Promise<void> {
		this.pendingImages.splice(0, this.pendingImages.length)
		for (const o of this.inProgress.values()) {
			o.abort()
		}

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
			const abortController = new AbortController()
			this.inProgress.set(nextImage.key, abortController)

			nextImage
				.fn(nextImage.key, abortController.signal)
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

					// Run again
					setImmediate(() => {
						this.tryDequeue()
					})
				})
		}
	}
}
