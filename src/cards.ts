import * as path from 'path'
import { createCanvas, Image, loadImage } from 'canvas'
import { StreamDeck } from 'elgato-stream-deck'

export class CardGenerator {
	private iconImage: Image | undefined

	async loadIcon(): Promise<Image> {
		if (!this.iconImage) {
			this.iconImage = await loadImage(path.join(__dirname, '../assets/icon.png'))
		}

		return this.iconImage
	}

	async generateBasicCard(deck: StreamDeck, remoteIp: string, status: string): Promise<Buffer> {
		const w = deck.ICON_SIZE * deck.KEY_COLUMNS
		const h = deck.ICON_SIZE * deck.KEY_ROWS

		const icon = await this.loadIcon()

		const canvas = createCanvas(w, h)
		const ctx = canvas.getContext('2d')

		// TODO this looks bad because we don't compensate for bezel
		const bottomPad = 30
		const size = Math.min(w, h) * 0.6
		ctx.drawImage(icon, (w - size) / 2, (h - size - bottomPad) / 2, size, size)

		ctx.fillStyle = 'rgb(255,255,255)'
		ctx.font = '12px Helvetica'
		ctx.fillText(`Remote: ${remoteIp}`, 10, h - 10)

		if (status) {
			ctx.fillText(`Status: ${status}`, 10, h - 10 - 16)
		}

		return canvas.toBuffer('raw')
	}
}
