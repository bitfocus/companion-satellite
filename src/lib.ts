import * as imageRs from '@julusian/image-rs'

export const DEFAULT_PORT = 16622

export function assertNever(_v: never): void {
	// Nothing to do
}

export async function rgbaToRgb(input: Uint8Array, width: number, height: number): Promise<Buffer> {
	return Buffer.from(
		(await imageRs.ImageTransformer.fromBuffer(input, width, height, imageRs.PixelFormat.Rgba)
			.scale(width, height)
			.toBuffer(imageRs.PixelFormat.Rgb)) as Uint8Array
	)
}

export function wrapAsync<TArgs extends any[]>(
	fn: (...args: TArgs) => Promise<void>,
	catcher: (e: any) => void
): (...args: TArgs) => void {
	return (...args) => {
		fn(...args).catch(catcher)
	}
}
