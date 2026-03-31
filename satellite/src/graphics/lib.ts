export function uint8ArrayToBuffer(arr: Uint8Array | Uint8ClampedArray): Buffer {
	return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)
}
