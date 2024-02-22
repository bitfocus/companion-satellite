import * as path from 'path'
import { promisify } from 'util'
import { readFile } from 'fs'
import { Canvas, Image, loadImage } from '@julusian/skia-canvas'
import * as imageRs from '@julusian/image-rs'
import { networkInterfaces } from 'os'

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

	async generateBasicCard(
		width: number,
		height: number,
		pixelFormat: imageRs.PixelFormat,
		remoteIp: string,
		status: string,
	): Promise<Buffer> {
		const iconImage = await this.loadIcon()

		const overSampling = 2 // Must be 1 or greater

		const canvasWidth = width * overSampling
		const canvasHeight = height * overSampling
		const canvas = new Canvas(canvasWidth, canvasHeight)
		const context2d = canvas.getContext('2d')
		context2d.scale(overSampling, overSampling)

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
			iconTargetSize,
		)

		// draw text
		context2d.font = `normal normal normal ${12}px sans-serif`
		context2d.textAlign = 'left'
		context2d.fillStyle = '#ffffff'

		context2d.fillText(`Remote: ${remoteIp}`, 10, height - 10)
		context2d.fillText(`Local: ${getIPAddress()}`, 10, height - 30)
		context2d.fillText(`Status: ${status}`, 10, height - 50)

		// return result
		const rawImage = Buffer.from(context2d.getImageData(0, 0, canvasWidth, canvasHeight).data)

		return await imageRs.ImageTransformer.fromBuffer(rawImage, canvasWidth, canvasHeight, imageRs.PixelFormat.Rgba)
			.scale(width, height)
			.toBuffer(pixelFormat)
	}
}

function getIPAddress() {
	for (const devName in networkInterfaces()) {
		const iface = networkInterfaces()[devName]
		if (iface) {
			for (let i = 0; i < iface.length; i++) {
				const alias = iface[i]
				if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) return alias.address
			}
		}
	}
	return '0.0.0.0'
}
