import { CardGenerator } from './cards.js'
import { LockingGraphicsGenerator } from './locking.js'

export { CardGenerator, LockingGraphicsGenerator }

export interface SurfaceGraphicsContext {
	readonly locking: LockingGraphicsGenerator
	readonly cards: CardGenerator
}
