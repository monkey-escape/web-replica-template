export type StorageState = 'unconfigured'

export interface ServiceHealth {
  ok: true
  service: 'api'
  storage: StorageState
}

// 明确告诉调用方：数据库和缓存都还没接。不要在这里加驱动。
export function serviceHealth(): ServiceHealth {
  return {
    ok: true,
    service: 'api',
    storage: 'unconfigured',
  }
}
