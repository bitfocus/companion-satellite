import * as path from 'path'
import { StreamDeck } from '@elgato-stream-deck/node'
import { promisify } from 'util'
import { readFile } from 'fs'
import * as sharp from 'sharp'

const readFileP = promisify(readFile)

export class CardGenerator {
	private iconImage: Buffer | undefined

	async loadIcon(): Promise<Buffer> {
		if (!this.iconImage) {
			const rawData = await readFileP(path.join(__dirname, '../assets/icon.png'))
			this.iconImage = rawData
		}

		return this.iconImage
	}

	async generateBasicCard(deck: StreamDeck, remoteIp: string, status: string): Promise<Buffer> {
		const w = deck.ICON_SIZE * deck.KEY_COLUMNS
		const h = deck.ICON_SIZE * deck.KEY_ROWS

		const size = Math.round(Math.min(w, h) * 0.6)
		const icon = await sharp(await this.loadIcon())
			.resize(size)
			.toBuffer()

		return sharp({
			create: {
				width: w,
				height: h,
				channels: 3,
				background: { r: 0, g: 0, b: 0 },
			},
		})
			.composite([
				{
					input: icon,
				},
				{
					input: Buffer.from(
						`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w - 20} 40" version="1.1">
						<text font-family="'sans-serif'" font-size="12px" x="10" y="32" fill="#fff" text-anchor="left">Remote: ${remoteIp}</text>
						<text font-family="'sans-serif'" font-size="12px" x="10" y="12" fill="#fff" text-anchor="left">Status: ${status}</text>
						</svg>`
					),
					top: h - 20,
					left: 10,
				},
			])
			.toBuffer()
	}
}
