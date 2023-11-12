import type { ApiConfigData } from '../../../src/rest'

export type ApiConfigData2 = ApiConfigData

export type SaveApiConfigData = (newConfig: ApiConfigData2) => Promise<void>
