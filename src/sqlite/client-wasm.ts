import type {
	Database,
	PreparedStatement,
	SqlValue,
	Sqlite3Static
} from '@libsql/libsql-wasm-experimental'

import type {
	Client,
	InArgs,
	InStatement,
	InValue,
	IntMode,
	Replicated,
	ResultSet,
	Row,
	Transaction,
	TransactionMode,
	Value
} from '@libsql/core/api'
import { LibsqlError } from '@libsql/core/api'
import { expandConfig } from '@libsql/core/config'
import {
	ResultSetImpl,
	supportedUrlLink,
	transactionModeToBegin
} from '@libsql/core/util'
// import sqliteParser, {
// 	type StatementListNode,
// 	type StatementNode
// } from 'sqlite-parser'
import type {
	Config,
	ExpandedConfig,
	PoolUtil,
	Sqlite3ClientType
} from './types'

export * from '@libsql/core/api'
export function createClient(
	config: Config,
	sqlite3: Sqlite3ClientType
): [Sqlite3Client, Database] {
	return _createClient(
		{ ...expandConfig(config, true), poolUtil: config.poolUtil },
		sqlite3
	)
}

/** @private */
function createDb(
	sqlite3: Sqlite3ClientType,
	path: string,
	poolUtil?: PoolUtil | undefined
): Database {
	let db: Database
	if (poolUtil) {
		db = new poolUtil.OpfsSAHPoolDb(path)
	} else if ('opfs' in sqlite3) {
		db = new sqlite3.oo1.OpfsDb(path, 'c')
	} else {
		db = new sqlite3.oo1.DB()
	}
	return db
}
/** @private */
export function _createClient(
	config: ExpandedConfig,
	sqlite3: Sqlite3ClientType
): [Sqlite3Client, Database] {
	if (config.scheme !== 'file') {
		throw new LibsqlError(
			`URL scheme ${JSON.stringify(
				config.scheme + ':'
			)} is not supported by the local sqlite3 client. ` +
				`For more information, please read ${supportedUrlLink}`,
			'URL_SCHEME_NOT_SUPPORTED'
		)
	}
	if (config.encryptionKey !== undefined) {
		throw new LibsqlError(
			'Encryption key is not supported by the Wasm client.',
			'ENCRYPTION_KEY_NOT_SUPPORTED'
		)
	}

	const authority = config.authority
	if (authority !== undefined) {
		const host = authority.host.toLowerCase()
		if (host !== '' && host !== 'localhost') {
			throw new LibsqlError(
				`Invalid host in file URL: ${JSON.stringify(authority.host)}. ` +
					'A "file:" URL with an absolute path should start with one slash ("file:/absolute/path.db") ' +
					'or with three slashes ("file:///absolute/path.db"). ' +
					`For more information, please read ${supportedUrlLink}`,
				'URL_INVALID'
			)
		}

		if (authority.port !== undefined) {
			throw new LibsqlError('File URL cannot have a port', 'URL_INVALID')
		}
		if (authority.userinfo !== undefined) {
			throw new LibsqlError(
				'File URL cannot have username and password',
				'URL_INVALID'
			)
		}
	}

	const path = config.path
	// const options = {
	// 	authToken: config.authToken,
	// 	syncUrl: config.syncUrl
	// }
	const db = createDb(sqlite3, path, config.poolUtil)
	executeStmt(db, 'SELECT 1 AS checkThatTheDatabaseCanBeOpened', config.intMode)
	executeStmt(db, 'PRAGMA table_info(users)', config.intMode)
	const clinet = new Sqlite3Client(
		sqlite3,
		path,
		db,
		config.intMode,
		config.poolUtil
	)
	return [clinet, db]
}

function inTransaction(db: Database): boolean {
	return db.getAutocommit() == 0
}

export class Sqlite3Client implements Client {
	#sqlite3: Sqlite3Static
	#path: string
	#db: Database | null
	#intMode: IntMode
	#poolUtil?: PoolUtil | undefined
	closed: boolean
	protocol: 'file'

	/** @private */
	constructor(
		sqlite3: Sqlite3Static,
		path: string,
		/*options: Database.Options,*/ db: Database,
		intMode: IntMode,
		poolUtil?: PoolUtil | undefined
	) {
		this.#sqlite3 = sqlite3
		this.#path = path
		//this.#options = options;
		this.#db = db
		this.#intMode = intMode
		this.closed = false
		this.protocol = 'file'
		this.#poolUtil = poolUtil
	}

	async execute(
		stmtOrSql: InStatement | string,
		args?: InArgs
	): Promise<ResultSet> {
		let stmt: InStatement

		if (typeof stmtOrSql === 'string') {
			stmt = {
				sql: stmtOrSql,
				args: args || []
			}
		} else {
			stmt = stmtOrSql
		}

		this.#checkNotClosed()
		return executeStmt(this.#getDb(), stmt, this.#intMode)
	}

	executeSync(stmtOrSql: InStatement | string, args?: InArgs): ResultSet {
		let stmt: InStatement

		if (typeof stmtOrSql === 'string') {
			stmt = {
				sql: stmtOrSql,
				args: args || []
			}
		} else {
			stmt = stmtOrSql
		}

		this.#checkNotClosed()
		return executeStmt(this.#getDb(), stmt, this.#intMode)
	}

	async batch(
		stmts: Array<InStatement>,
		mode: TransactionMode = 'deferred'
	): Promise<Array<ResultSet>> {
		this.#checkNotClosed()
		const db = this.#getDb()
		try {
			executeStmt(db, transactionModeToBegin(mode), this.#intMode)
			const resultSets = stmts.map(stmt => {
				if (!inTransaction(db)) {
					throw new LibsqlError(
						'The transaction has been rolled back',
						'TRANSACTION_CLOSED'
					)
				}
				return executeStmt(db, stmt, this.#intMode)
			})
			executeStmt(db, 'COMMIT', this.#intMode)
			return resultSets
		} finally {
			if (inTransaction(db)) {
				executeStmt(db, 'ROLLBACK', this.#intMode)
			}
		}
	}

	async migrate(stmts: Array<InStatement>): Promise<Array<ResultSet>> {
		this.#checkNotClosed()
		const db = this.#getDb()
		try {
			executeStmt(db, 'PRAGMA foreign_keys=off', this.#intMode)
			executeStmt(db, transactionModeToBegin('deferred'), this.#intMode)
			const resultSets = stmts.map(stmt => {
				if (!inTransaction(db)) {
					throw new LibsqlError(
						'The transaction has been rolled back',
						'TRANSACTION_CLOSED'
					)
				}
				return executeStmt(db, stmt, this.#intMode)
			})
			executeStmt(db, 'COMMIT', this.#intMode)
			return resultSets
		} finally {
			if (inTransaction(db)) {
				executeStmt(db, 'ROLLBACK', this.#intMode)
			}
			executeStmt(db, 'PRAGMA foreign_keys=on', this.#intMode)
		}
	}

	async transaction(mode: TransactionMode = 'write'): Promise<Transaction> {
		const db = this.#getDb()
		executeStmt(db, transactionModeToBegin(mode), this.#intMode)
		this.#db = null // A new connection will be lazily created on next use
		return new Sqlite3Transaction(db, this.#intMode)
	}

	async executeMultiple(sql: string): Promise<void> {
		this.#checkNotClosed()
		const db = this.#getDb()
		try {
			return executeMultiple(db, sql)
		} finally {
			if (inTransaction(db)) {
				executeStmt(db, 'ROLLBACK', this.#intMode)
			}
		}
	}

	async sync(): Promise<Replicated> {
		throw new LibsqlError(
			'sync not supported in wasm mode',
			'SYNC_NOT_SUPPORTED'
		)
	}

	close(): void {
		this.closed = true
		if (this.#db !== null) {
			this.#db.close()
		}
	}

	#checkNotClosed(): void {
		if (this.closed) {
			throw new LibsqlError('The client is closed', 'CLIENT_CLOSED')
		}
	}

	// Lazily creates the database connection and returns it
	#getDb(): Database {
		if (this.#db === null) {
			this.#db = createDb(this.#sqlite3, this.#path, this.#poolUtil)
		}
		return this.#db
	}
}

export class Sqlite3Transaction implements Transaction {
	#database: Database
	#intMode: IntMode

	/** @private */
	constructor(database: Database, intMode: IntMode) {
		this.#database = database
		this.#intMode = intMode
	}

	async execute(stmt: InStatement): Promise<ResultSet> {
		this.#checkNotClosed()
		return executeStmt(this.#database, stmt, this.#intMode)
	}

	async batch(stmts: Array<InStatement>): Promise<Array<ResultSet>> {
		return stmts.map(stmt => {
			this.#checkNotClosed()
			return executeStmt(this.#database, stmt, this.#intMode)
		})
	}

	async executeMultiple(sql: string): Promise<void> {
		this.#checkNotClosed()
		return executeMultiple(this.#database, sql)
	}

	async rollback(): Promise<void> {
		if (!this.#database.isOpen()) {
			return
		}
		this.#checkNotClosed()
		executeStmt(this.#database, 'ROLLBACK', this.#intMode)
	}

	async commit(): Promise<void> {
		this.#checkNotClosed()
		executeStmt(this.#database, 'COMMIT', this.#intMode)
	}

	close(): void {
		if (inTransaction(this.#database)) {
			executeStmt(this.#database, 'ROLLBACK', this.#intMode)
		}
	}

	get closed(): boolean {
		return !inTransaction(this.#database)
	}

	#checkNotClosed(): void {
		if (this.closed) {
			throw new LibsqlError('The transaction is closed', 'TRANSACTION_CLOSED')
		}
	}
}
// const getAffectedTables = (
// 	node: StatementNode | StatementListNode,
// 	set = new Set<string>()
// ): Set<string> => {
// 	if (!node || typeof node !== 'object') return set
// 	if (!(node.type === 'statement')) return set
// 	if (node.variant === 'select')
// 		for (const key in node) {
// 			const child = node[key as keyof StatementNode]
// 			if (Array.isArray(child)) {
// 				child.forEach(n => getAffectedTables(n, set))
// 			} else if (child && typeof child === 'object') {
// 				getAffectedTables(child, set)
// 			}
// 		}

// 	return set
// }

function executeStmt(
	db: Database,
	stmt: InStatement,
	intMode: IntMode
): ResultSet {
	let sql: string
	let args: Array<SqlValue> | Record<string, SqlValue>
	if (typeof stmt === 'string') {
		sql = stmt
		args = []
	} else {
		sql = stmt.sql
		if (Array.isArray(stmt.args)) {
			args = stmt.args.map(value => valueToSql(value, intMode))
		} else {
			args = {}
			for (const name in stmt.args) {
				const argName =
					name[0] === '@' || name[0] === '$' || name[0] === ':'
						? name.substring(1)
						: name
				args[argName] = valueToSql(stmt.args[name], intMode)
			}
		}
	}
	// const ast = sqliteParser(sql)
	// const tables = Array.from(getAffectedTables(ast))
	// if (tables.length > 0) {
	// console.log('Affected tables:', tables)
	// }
	let sqlStmt: PreparedStatement

	// 1) catch prepare-time errors and map them
	try {
		sqlStmt = db.prepare(sql)
	} catch (e) {
		throw mapSqliteError(e)
	}
	try {
		// TODO: sqlStmt.safeIntegers(true);

		let returnsData = sqlStmt.columnCount > 0

		if (Array.isArray(args)) {
			for (let i = 0; i < args.length; ++i) {
				const value = args[i]
				sqlStmt.bind(i + 1, value)
			}
		} else {
			for (const argName in args) {
				const idx = sqlStmt.getParamIndex(argName)!
				const value = args[argName]
				sqlStmt.bind(idx, value)
			}
		}
		if (returnsData) {
			let columns: string[] = sqlStmt.getColumnNames()
			let columnTypes: string[] = []
			let rows: Row[] = []
			for (;;) {
				if (!sqlStmt.step()) {
					break
				}
				const values: unknown[] = sqlStmt.get([])
				const row = rowFromSql(values, columns, intMode)
				rows.push(row)
			}
			rows.forEach(row => {
				row.id
			})
			const rowsAffected = 0
			const lastInsertRowid = undefined
			return new ResultSetImpl(
				columns,
				columnTypes,
				rows,
				rowsAffected,
				lastInsertRowid
			)
		} else {
			sqlStmt.step() // TODO: check return value
			const rowsAffected = db.changes()
			const lastInsertRowid = BigInt(db.lastInsertRowid())
			return new ResultSetImpl([], [], [], rowsAffected, lastInsertRowid)
		}
	} catch (e) {
		throw mapSqliteError(e)
	} finally {
		sqlStmt.finalize()
	}
}

function rowFromSql(
	sqlRow: Array<unknown>,
	columns: Array<string>,
	intMode: IntMode
): Row {
	const row = {}
	// make sure that the "length" property is not enumerable
	Object.defineProperty(row, 'length', { value: sqlRow.length })
	for (let i = 0; i < sqlRow.length; ++i) {
		const value = valueFromSql(sqlRow[i], intMode)
		Object.defineProperty(row, i, { value })

		const column = columns[i]
		if (!Object.hasOwn(row, column)) {
			Object.defineProperty(row, column, {
				value,
				enumerable: true,
				configurable: true,
				writable: true
			})
		}
	}
	return row as Row
}

function valueFromSql(sqlValue: unknown, intMode: IntMode): Value {
	if (typeof sqlValue === 'bigint') {
		if (intMode === 'number') {
			if (sqlValue < minSafeBigint || sqlValue > maxSafeBigint) {
				throw new RangeError(
					'Received integer which cannot be safely represented as a JavaScript number'
				)
			}
			return Number(sqlValue)
		} else if (intMode === 'bigint') {
			return sqlValue
		} else if (intMode === 'string') {
			return '' + sqlValue
		} else {
			throw new Error('Invalid value for IntMode')
		}
	}
	return sqlValue as Value
}

const minSafeBigint = -9007199254740991n
const maxSafeBigint = 9007199254740991n

function valueToSql(value: InValue, intMode: IntMode): SqlValue {
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new RangeError(
				'Only finite numbers (not Infinity or NaN) can be passed as arguments'
			)
		}
		return value
	} else if (typeof value === 'bigint') {
		if (value < minInteger || value > maxInteger) {
			throw new RangeError(
				'bigint is too large to be represented as a 64-bit integer and passed as argument'
			)
		}
		return value
	} else if (typeof value === 'boolean') {
		switch (intMode) {
			case 'bigint':
				return value ? 1n : 0n
			case 'string':
				return value ? '1' : '0'
			default:
				return value ? 1 : 0
		}
	} else if (value instanceof Date) {
		return value.valueOf()
	} else if (value === undefined) {
		throw new TypeError(
			'undefined cannot be passed as argument to the database'
		)
	} else {
		return value
	}
}

const minInteger = -9223372036854775808n
const maxInteger = 9223372036854775807n

function executeMultiple(db: Database, sql: string): void {
	try {
		db.exec(sql)
	} catch (e) {
		throw mapSqliteError(e)
	}
}

function mapSqliteError(e: unknown): unknown {
	// TODO: Map to LibsqlError
	return e
}
