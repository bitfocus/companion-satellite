import { readFile } from 'fs/promises'
import { Canvas, Image, loadImage } from '@napi-rs/canvas'
import * as imageRs from '@julusian/image-rs'
import { networkInterfaces } from 'os'

export class CardGenerator {
	private iconImage: Image | undefined

	async loadIcon(): Promise<Image> {
		if (!this.iconImage) {
			const rawData = await readFile(new URL('../assets/icon.png', import.meta.url))

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

		const computedImage = await imageRs.ImageTransformer.fromBuffer(
			rawImage,
			canvasWidth,
			canvasHeight,
			imageRs.PixelFormat.Rgba,
		)
			.scale(width, height, imageRs.ResizeMode.Exact)
			.toBuffer(pixelFormat)

		return computedImage.buffer
	}

	async generateLcdStripCard(
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
		const iconBoundingSize = Math.min(width, height)
		const iconTargetSize = Math.round(iconBoundingSize * 0.8)
		const iconTargetX = width - iconBoundingSize
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

		const computedImage = await imageRs.ImageTransformer.fromBuffer(
			rawImage,
			canvasWidth,
			canvasHeight,
			imageRs.PixelFormat.Rgba,
		)
			.scale(width, height, imageRs.ResizeMode.Exact)
			.toBuffer(pixelFormat)

		return computedImage.buffer
	}

	async generateLogoCard(width: number, height: number): Promise<Buffer> {
		const iconImage = await this.loadIcon()

		const canvasWidth = width
		const canvasHeight = height
		const canvas = new Canvas(canvasWidth, canvasHeight)
		const context2d = canvas.getContext('2d')

		// draw icon
		const iconTargetSize = Math.round(Math.min(width, height) * 0.8)
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

		// return result
		const rawImage = Buffer.from(context2d.getImageData(0, 0, canvasWidth, canvasHeight).data)

		return rawImage
	}

	generatePincodeChar(width: number, height: number, keyCode: number | string): Uint8ClampedArray {
		const canvasWidth = width
		const canvasHeight = height

		const canvas = new Canvas(canvasWidth, canvasHeight)
		const context2d = canvas.getContext('2d')

		// Ensure background is black
		context2d.fillStyle = '#000000'
		context2d.fillRect(0, 0, width, height)

		// Draw centered text
		context2d.font = `${Math.floor(height * 0.7)}px`
		context2d.textAlign = 'center'
		context2d.textBaseline = 'middle'
		context2d.fillStyle = '#ffffff'
		context2d.fillText(keyCode + '', width / 2, height / 2)

		return context2d.getImageData(0, 0, canvasWidth, canvasHeight).data
	}

	generatePincodeValue(width: number, height: number, charCount: number): Uint8ClampedArray {
		const canvasWidth = width
		const canvasHeight = height

		const canvas = new Canvas(canvasWidth, canvasHeight)
		const context2d = canvas.getContext('2d')

		// Ensure background is black
		context2d.fillStyle = '#000000'
		context2d.fillRect(0, 0, width, height)

		context2d.textAlign = 'center'
		context2d.textBaseline = 'middle'

		// Draw heading
		context2d.font = `${Math.floor(height * 0.2)}px`
		context2d.fillStyle = '#ffc600'
		context2d.fillText('Lockout', width / 2, height * 0.2)

		// Draw progress
		context2d.fillStyle = '#ffffff'
		context2d.font = `${Math.floor(height * 0.2)}px`
		context2d.fillText('*'.repeat(charCount), width / 2, height * 0.65)

		return context2d.getImageData(0, 0, canvasWidth, canvasHeight).data
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
