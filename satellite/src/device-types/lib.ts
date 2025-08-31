import * as imageRs from '@julusian/image-rs'
import type { GridSize } from '../surfaceProxy.js'
import type { SatelliteSurfaceLayout } from '../generated/SurfaceSchema.js'

export function parseColor(color: string | undefined): { r: number; g: number; b: number } {
	const r = color ? parseInt(color.substr(1, 2), 16) : 0
	const g = color ? parseInt(color.substr(3, 2), 16) : 0
	const b = color ? parseInt(color.substr(5, 2), 16) : 0

	return { r, g, b }
}

export interface TransformButtonImage {
	buffer: Buffer
	width: number
	height: number
	pixelFormat: imageRs.PixelFormat
}

/**
 * Transform a button image render to the format needed for a surface integration
 */
export async function transformButtonImage(
	rawImage: TransformButtonImage | undefined,
	targetWidth: number,
	targetHeight: number,
	targetFormat: imageRs.PixelFormat,
): Promise<Buffer> {
	if (!rawImage) throw new Error('No input image provided')

	const needsResize = rawImage.width !== targetWidth || rawImage.height !== targetHeight
	if (!needsResize && targetFormat === rawImage.pixelFormat) return rawImage.buffer

	let image = imageRs.ImageTransformer.fromBuffer(
		rawImage.buffer,
		rawImage.width,
		rawImage.height,
		rawImage.pixelFormat,
	)

	if (needsResize) {
		image = image.scale(targetWidth, targetHeight, 'Fit')

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
	}

	const computedImage = await image.toBuffer(targetFormat)
	return computedImage.buffer
}

export function calculateGridSize(schema: SatelliteSurfaceLayout): GridSize {
	return Object.values(schema.controls).reduce(
		(gridSize, control): GridSize => ({
			columns: Math.max(gridSize.columns, control.column + 1),
			rows: Math.max(gridSize.rows, control.row + 1),
		}),
		{ columns: 0, rows: 0 },
	)
}
