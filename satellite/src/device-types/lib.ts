import * as imageRs from '@julusian/image-rs'
import { DeviceDrawImage } from './api.js'

export function parseColor(color: string | undefined): { r: number; g: number; b: number } {
	const r = color ? parseInt(color.substr(1, 2), 16) : 0
	const g = color ? parseInt(color.substr(3, 2), 16) : 0
	const b = color ? parseInt(color.substr(5, 2), 16) : 0

	return { r, g, b }
}

/**
 * Transform a button image render to the format needed for a surface integration
 */
export async function transformButtonImage(
	rawImage: DeviceDrawImage | undefined,
	targetWidth: number,
	targetHeight: number,
	targetFormat: imageRs.PixelFormat,
): Promise<Buffer> {
	if (!rawImage) throw new Error('No input image provided')

	if (rawImage.width === targetWidth && rawImage.height === targetHeight && targetFormat === rawImage.pixelFormat)
		return rawImage.buffer

	let image = imageRs.ImageTransformer.fromBuffer(
		rawImage.buffer,
		rawImage.width,
		rawImage.height,
		rawImage.pixelFormat,
	)

	image = image.scale(targetWidth, targetHeight, imageRs.ResizeMode.Fit)

	// pad, in case a button is non-square
	const dimensions = image.getCurrentDimensions()
	const xOffset = (targetWidth - dimensions.width) / 2
	const yOffset = (targetHeight - dimensions.height) / 2

	image = image.pad(Math.floor(xOffset), Math.ceil(xOffset), Math.floor(yOffset), Math.ceil(yOffset), {
		red: 0,
		green: 0,
		blue: 0,
		alpha: 255,
	})

	const computedImage = await image.toBuffer(targetFormat)
	return computedImage.buffer
}
