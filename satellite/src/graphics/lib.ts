import { CardGenerator } from './cards.js'
import { LockingGraphicsGenerator } from './locking.js'

export { CardGenerator, LockingGraphicsGenerator }

export interface SurfaceGraphicsContext {
	readonly locking: LockingGraphicsGenerator
	readonly cards: CardGenerator
}

export function uint8ArrayToBuffer(arr: Uint8Array | Uint8ClampedArray): Buffer {
	return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)
}
