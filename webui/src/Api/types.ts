import type { ApiConfigData } from '../../../src/apiTypes'

export type SaveApiConfigData = (newConfig: Partial<ApiConfigData>) => Promise<void>
