import type { ApiConfigData } from '../../../satellite/src/apiTypes'

export type SaveApiConfigData = (newConfig: Partial<ApiConfigData>) => Promise<void>
