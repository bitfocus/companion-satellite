import type { ApiConfigData } from '../../../src/apiTypes'

export type ApiConfigData2 = ApiConfigData

export type SaveApiConfigData = (newConfig: Partial<ApiConfigData2>) => Promise<void>
