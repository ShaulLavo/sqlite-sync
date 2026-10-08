# sqlite-sync

Reactive SQLite for the browser. A framework-independent TypeScript core runs SQLite WASM in a worker, persists data in OPFS, and publishes committed query snapshots. Solid and Drizzle adapters are optional.

The playground makes Conway's Game of Life a database workload. Cell edits and generations run inside SQLite. The SQL editor, table explorer, subscription inspector and change stream display actual database activity. Reloading restores the board and generation.

## Run the playground

```sh
bun install --frozen-lockfile
bun run dev
```

Open the printed localhost URL. Deployment needs HTTPS, OPFS, Web Locks, and permission to load same-origin module workers. The SAH pool does not need cross-origin isolation headers. Data belongs to the site's origin and browser profile. Browser storage eviction and private browsing can affect persistence.

## Framework-neutral usage

```ts
import { openDatabase } from 'sqlite-sync'

const db = openDatabase({
	name: 'notes.db',
	migrations: [{
		id: '001-notes',
		sql: ['CREATE TABLE notes(id INTEGER PRIMARY KEY, body TEXT NOT NULL)']
	}]
})
await db.ready

const notes = db.liveQuery('SELECT id, body FROM notes ORDER BY id DESC LIMIT 20')
const unsubscribe = notes.subscribe(snapshot => {
	if (snapshot.status === 'ready') renderNotes(snapshot.rows)
	if (snapshot.status === 'error') showError(snapshot.error)
})
await db.execute('INSERT INTO notes(body) VALUES (?)', ['Hello SQLite'])
unsubscribe()
db.close()
```

`liveQuery()` discovers physical table dependencies through SQLite's authorizer. Joins, views, filters, aggregates, ordering, and limits rerun only after relevant commits. Identical queries share work. Unchanged results do not publish another snapshot.

`liveTable('notes')` applies row patches for tables with a non-null primary key. Nullable composite keys and tables without a stable primary key use SQL reruns. Full-table collections have no ordering guarantee; use SQL `ORDER BY` when order matters. Duplicate SQL column names gain numeric suffixes in object snapshots. SQL execution and Drizzle retain positional result arrays.

A subscription registers and reads its initial snapshot in one worker operation. Query snapshots reflect committed state. Message delivery is asynchronous; completing a mutation does not represent a browser paint. Unsubscribing is safe during initialization. Retain the unsubscribe function in framework-neutral consumers.

## Atomic mutations

```ts
await db.batch([
	{ sql: 'INSERT INTO notes(body) VALUES (?)', params: ['One'] },
	{ sql: 'UPDATE notes SET body = ? WHERE id = ?', params: ['Two', 1] }
])
```

A batch owns one transaction, uses one worker request, and rolls back entirely on failure. Savepoints inside a batch are supported. Transactions cannot span separate calls or tabs. Send one SQL statement per `execute()` call; raw `BEGIN`, `COMMIT`, and top-level savepoints are rejected.

Ordinary `execute()` preserves SQLite's statement semantics, including partial changes from `RAISE(FAIL)`. Committed changes still reach subscribers if that call rejects. Use `batch()` when the operation must be all-or-nothing.

## Optional adapters

```ts
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { drizzleDriver, liveDrizzleQuery } from 'sqlite-sync/drizzle'

const { driver, batchDriver } = drizzleDriver(db)
const orm = drizzle(driver, batchDriver)
const query = liveDrizzleQuery(db, orm.select().from(notesTable))
```

The Drizzle adapter supports positional results, `get`, `all`, `values`, `RETURNING`, and atomic batches. It converts Drizzle bindings before passing them to the core. Drizzle's callback-based proxy transactions are not supported; use its `batch()` or the core batch API.

```ts
import { createLiveQuery } from 'sqlite-sync/solid'

const notes = createLiveQuery(db.liveTable('notes'), {
	map: row => ({ id: Number(row.id), body: String(row.body) }),
	key: 'id'
})
// notes.rows, notes.loading(), notes.error()
```

Create the Solid adapter inside a Solid owner. It reconciles rows, batches store writes, caches mapping of unchanged rows, and unregisters on cleanup. Supply a unique key for composite-key rows. The core imports no Solid code. Emitted rows are immutable by convention; do not modify returned BLOB buffers.

## Storage, events and ownership

OPFS is the default. Memory storage requires explicit `storage: 'memory'`; a storage failure never silently changes persistence mode. The demo adopts its existing database directory and migration journal.

Shared ownership uses a named SharedWorker as a broker and a tab-hosted dedicated worker for SQLite. SQL and subscriptions use directly transferred ports. Web Locks prevent two owners opening the same SAH pool. Connections must use the same storage, migration and logging options. If the owner tab closes, surviving tabs open a new owner and refresh query snapshots. Worker counters and revisions restart with that owner; they are not replication cursors.

Without SharedWorker, or with `ownership: 'exclusive'`, a dedicated worker owns the database. A second owner receives a database-in-use error. Worker failures and timeouts reject pending operations. An interrupted write may have committed before its reply disappeared. The core never automatically retries it.

```ts
const stop = db.subscribeEvents(event => {
	if (event.kind === 'commit') console.info(event.revision, event.changes)
})
const diagnostics = await db.inspect()
const sqliteFile = await db.exportDatabase()
```

Trigger observations within a commit arrive in SQLite observation order and include old and new keys. Rollbacks stay silent. NULL-safe, binary-value no-op suppression affects observation, never SQL writes. BLOBs, precise double values and 64-bit integers survive both snapshots and change events.

Reactive notifications use a transactional **temporary** queue. They do not require persistent change records. `durableLog: true` separately enables persistent transaction-bound `change_log` records, which the demo retains. Retention is explicit. Trigger images can describe intermediate states in recursive cascades; they are not a complete synchronization protocol. Live table patches separately read the affected keys after commit to guarantee final row values. The `change_log` name is reserved only when this option is enabled. Replication, acknowledgments and conflict resolution are not implemented.

## Build and verify

```sh
bun run check
bun run bench
```

Install a Playwright browser first with `bun x playwright install chromium`. To use an existing Chromium, set `CHROMIUM_PATH` to its executable. `bun run check` checks application, config and test TypeScript, runs real WASM tests, builds the demo and library, then runs headless browser integration tests. Benchmarks run separately on port 5179 with HMR disabled.

`bun run build:lib` writes ESM and declarations to `dist-lib`, with separate core, Solid and Drizzle entries. Worker asset URLs are relative so the built library can be served beneath a path. No npm release has been published.

See [architecture and tradeoffs](docs/architecture.md), [benchmark methodology and results](docs/benchmarks.md), [audit plan](docs/audit-plan.md), and [decision trail](.audit/decisions.tsv).

## Current limits

The supported observation domain is ordinary tables in the main database. Virtual table creation, attached databases, application TEMP tables and mutable runtime PRAGMAs are rejected. Metadata reads such as `PRAGMA table_info(notes)` remain available. Queries using volatile functions do not refresh on time alone. Large collections still require an array snapshot and framework reconciliation per publication. The statement cache holds at most 128 prepared statements; use parameter bindings rather than thousands of distinct literal SQL strings for hot writes.

The core does not provide a remote synchronization server, automatic mutation replay, or browser paint measurements. OPFS availability and worker behavior have been verified in Chromium; other browser engines need their own integration run.
