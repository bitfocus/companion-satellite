import * as imageRs from '@julusian/image-rs'

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
	buffer: Buffer | undefined,
	bufferWidth: number | null,
	bufferHeight: number | null,
	targetWidth: number,
	targetHeight: number,
	targetFormat: imageRs.PixelFormat,
): Promise<Buffer> {
	if (!buffer) throw new Error('No buffer provided')
	if (!bufferWidth) throw new Error('No bufferWidth provided')
	if (!bufferHeight) throw new Error('No bufferHeight provided')

	if (bufferWidth === targetWidth && bufferHeight === targetHeight && targetFormat === imageRs.PixelFormat.Rgb)
		return buffer

	let image = imageRs.ImageTransformer.fromBuffer(buffer, bufferWidth, bufferHeight, imageRs.PixelFormat.Rgb)

	image = image.scale(targetWidth, targetHeight, imageRs.ResizeMode.Fit)

	// pad, in case a button is non-square
	const dimensions = image.getCurrentDimensions()
	const maxDimension = Math.max(dimensions.width, dimensions.height)
	const xOffset = (targetWidth - maxDimension) / 2
	const yOffset = (targetHeight - maxDimension) / 2
	image = image.pad(Math.floor(xOffset), Math.ceil(xOffset), Math.floor(yOffset), Math.ceil(yOffset), {
		red: 0,
		green: 0,
		blue: 0,
		alpha: 255,
	})

	const computedImage = await image.toBuffer(targetFormat)
	return computedImage.buffer
}
