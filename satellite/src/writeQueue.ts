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

export class ImageWriteQueue<TArgs extends unknown[] = [buffer: Buffer]> {
	private readonly maxConcurrent = 3
	private readonly pendingImages: Array<{ key: number; args: TArgs }> = []
	private inProgress = new Set<number>()

	constructor(private readonly fillImage: (key: number, ...args: TArgs) => Promise<void>) {}

	public abort(): void {
		this.pendingImages.splice(0, this.pendingImages.length)
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

			this.fillImage(nextImage.key, ...nextImage.args)
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
