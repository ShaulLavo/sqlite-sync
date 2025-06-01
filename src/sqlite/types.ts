// src/worker/types.ts
import type sqlite3InitModule from '@libsql/libsql-wasm-experimental'

import type { InArgs } from '@libsql/core/api'
import type { ExpandedConfig as _ExpandedConfig } from '@libsql/core/config'

export type Sqlite3Method = 'get' | 'all' | 'run' | 'values'

export type DriverQueryResult = { rows: unknown[][] }
export type DriverQuery = {
	sql: string
	params?: InArgs
	method?: Sqlite3Method
}

export type Sqlite3ClientType = Awaited<ReturnType<typeof sqlite3InitModule>>
export type PoolUtil = Awaited<
	ReturnType<Sqlite3ClientType['installOpfsSAHPoolVfs']>
>
export type ExpandedConfig = _ExpandedConfig & {
	poolUtil?: PoolUtil
}
