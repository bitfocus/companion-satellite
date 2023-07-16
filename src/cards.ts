import * as path from 'path'
import { promisify } from 'util'
import { readFile } from 'fs'
import { Canvas, Image, loadImage } from '@julusian/skia-canvas'

const readFileP = promisify(readFile)

export class CardGenerator {
	private iconImage: Image | undefined

	constructor() {
		// Ensure skia-canvas is loaded at startup
		new Canvas()
	}

	async loadIcon(): Promise<Image> {
		if (!this.iconImage) {
			const rawData = await readFileP(path.join(__dirname, '../assets/icon.png'))

			this.iconImage = await loadImage(rawData)
		}

		return this.iconImage
	}

	async generateBasicCard(width: number, height: number, remoteIp: string, status: string): Promise<Buffer> {
		const iconImage = await this.loadIcon()

		const canvas = new Canvas(width, height)
		const context2d = canvas.getContext('2d')

		// draw icon
		const iconTargetSize = Math.round(Math.min(width, height) * 0.6)
		const iconTargetX = (width - iconTargetSize) / 2
		const iconTargetY = (height - iconTargetSize) / 2
		context2d.drawImage(
			iconImage,
			0,
			0,
			iconImage.width,
			iconImage.height,
			iconTargetX,
			iconTargetY,
			iconTargetSize,
			iconTargetSize
		)

		// draw text
		context2d.font = `normal normal normal ${12}px sans-serif`
		context2d.textAlign = 'left'
		context2d.fillStyle = '#ffffff'

		context2d.fillText(`Remote: ${remoteIp}`, 10, height - 10)
		context2d.fillText(`Status: ${status}`, 10, height - 30)

		// return result
		return Buffer.from(context2d.getImageData(0, 0, width, height).data)
	}
}
