import { readFile } from 'fs/promises'
import sharp from 'sharp'

export class CardGenerator {
	private iconImage: Buffer | undefined

	async loadIcon(): Promise<Buffer> {
		if (!this.iconImage) {
			const rawData = await readFile(new URL('../assets/icon.png', import.meta.url))
			this.iconImage = rawData
		}

		return this.iconImage
	}

	async generateBasicCard(width: number, height: number, remoteIp: string, status: string): Promise<Buffer> {
		const size = Math.round(Math.min(width, height) * 0.6)
		const icon = await sharp(await this.loadIcon())
			.resize(size)
			.toBuffer()

		return sharp({
			create: {
				width: width,
				height: height,
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
						`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width - 20} 40" version="1.1">
						<text font-family="'sans-serif'" font-size="12px" x="10" y="32" fill="#fff" text-anchor="left">Remote: ${remoteIp}</text>
						<text font-family="'sans-serif'" font-size="12px" x="10" y="12" fill="#fff" text-anchor="left">Status: ${status}</text>
						</svg>`
					),
					top: height - 20,
					left: 10,
				},
			])
			.toBuffer()
	}
}
