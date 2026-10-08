# Architecture and decisions

## Existing path

The preserved legacy worker runs libsql's SQLite 3.45.1 WASM in a dedicated worker. Persistent AFTER triggers insert whole-row JSON into `change_log`. Drizzle's proxy sends SQL through Comlink, then the worker scans that log after every driver call. It delivers rows descending by id. Handwritten Solid hooks replay those events after executing their initial SELECT and registering a separate subscription.

Useful foundations were worker ownership, SQLite-backed cell state, transactions for batches, composite primary keys, and statement finalization. Those remain. The old implementation had no automated tests, and its root TypeScript command checked an empty project.

## Core boundaries

- `src/core/engine.ts` owns SQLite execution, transaction boundaries, prepared statements, dependency tracking, shared query groups and commit publication.
- `src/core/changes.ts` owns temporary observation triggers and lossless change decoding. Persistent logging is a separate option.
- `src/core/storage.ts` owns OPFS opening and atomic migrations. Legacy journal adoption requires explicit configuration.
- `src/core/client.ts` owns query snapshots, row identity, asynchronous transport, disposal and reconnection.
- Worker entry points own sessions, Web Locks and broker election.
- `src/adapters` translates bindings or subscriptions into Drizzle and Solid APIs. The engine has no framework dependency.
- `src/demo` owns the schema, simulation and presentation. Its metrics come from the engine or measured adapter work.

## Observation alternatives

Independent design sketches compared native preupdate journals with transactional temporary triggers. A separate judge selected the temporary queue for correctness under SQLite's existing SQL semantics. Native ideas retained were authorizer dependency tracking, flag-only commit hooks, bounded caches, and a framework-neutral API.

The installed official SQLite 3.49.2 WASM already enables `SQLITE_ENABLE_PREUPDATE_HOOK` and `SQLITE_ENABLE_SESSION`. No custom compilation is necessary. The production implementation now uses this official package, instead of the experimental libsql 3.45.1 wrapper. Drizzle only needs a proxy callback returning positional rows.

The actual native-hook regression test proves that preupdate emits a rolled-back savepoint update, while rollback_hook does not announce `ROLLBACK TO`. A simple JS callback buffer therefore cannot be the committed event log. Update hooks also omit WITHOUT ROWID tables and some replacement or truncate operations. Commit hooks run before final commit and cannot reenter SQLite, even for SELECT. In this implementation they only set flags; queue draining and notifications happen after stepping and statement completion, when autocommit is restored.

The session extension can supply compact future changesets. It collapses operations and has table and key requirements, so it is not a chronological UI event stream. Future use must account for its ownership of preupdate callbacks. No replication protocol depends on that extension today.

TEMP AFTER triggers insert ordered row data into a connection-local in-memory queue. SQLite rolls those inserts back with statement aborts, transactions and savepoints. `IS NOT` comparisons include every column and handle NULLs. There is no `RAISE(IGNORE)` suppression. Tagged scalar encoding preserves BLOB bytes, exact double values using SQLite printf, and integers outside JavaScript's safe-number range. Native integer and BLOB values also survive query results.

The queue is drained after commit in ascending sequence order and deleted before the next operation. UI revisions restart on owner replacement and are deliberately separate from durable log ids. A failed batch emits no changes. A failing standalone `RAISE(FAIL)` statement may retain earlier row changes; the engine publishes those committed changes while rejecting the failed SQL call.

Persistent AFTER triggers are opt-in and write inside the source transaction. They remain useful for future durable consumers, independently of UI subscriptions. Logging creates real storage and serialization overhead. There is no automatic pruning without a replication acknowledgment policy.

## Queries and snapshots

SQLite authorizer reads identify table dependencies, including underlying tables of views, joins, CTEs, filters and aggregates. `COUNT(*)` requires accepting an empty database name in the authorizer callback. Dependencies are refreshed after schema changes. A table-to-query index selects affected groups. Identical SQL and typed bindings share a group; unchanged SQL results do not publish again.

Full-table subscriptions with a non-null primary key use committed row patches. The worker reads only affected keys in bounded SQL chunks after commit, so recursive cascades cannot replay stale outer-trigger images into a query snapshot. The event stream retains trigger observations and is not a final-row patch stream. Updates retain Map positions and untouched row identities. Primary-key updates remove the old identity. Nullable composite keys can represent duplicate NULL-key rows in ordinary SQLite tables, so they use SQL reruns. Arbitrary ordered or limited SQL is never patched by guessing its semantics.

Subscription registration and initial SELECT run synchronously in the owning worker. No write interleaves. Cancellation tokens prevent late callbacks restoring disposed queries. Worker sessions release all subscriptions when their page lock disappears. Queries retain no additional full-table collection in the worker; newly joining table listeners receive a fresh committed SELECT.

Prepared statements are reset and cleared after execution, retained in a bounded 128-entry LRU, and finalized on errors, eviction, schema changes and close. Query result equality and snapshot construction have collection-size costs. The Solid adapter caches mappings for structurally shared rows and reconciles once per query publication.

## Browser ownership

SAH handles are available only in dedicated workers. Real Chromium also has no `Worker` constructor inside SharedWorker. That experiment rejected the initial nested-worker design.

The SharedWorker is instead a small broker. One connected page hosts the dedicated SQLite worker. Session data ports transfer directly to it, so SQL does not relay through the broker. Database Web Locks guard the pool, and per-page locks detect close or unexpected termination. A departed owner causes a new host election, fresh ports, new committed snapshots and reset owner counters. Pending writes reject as ambiguous, and are not replayed.

Exclusive fallback uses a dedicated worker and a nonwaiting owner lock. Unsupported storage fails visibly rather than silently substituting memory. Initialization errors retain their actual messages. Fatal worker-load errors fail all clients with the original error instead of entering a restart loop. Operations have bounded timeouts. Closing a database rejects pending requests and releases query callbacks, ports, workers and its page lock.

## Correctness regressions fixed

Tests cover descending legacy event order, repeat processing, atomic initial snapshots, no-op writes, nullable values, primary-key changes, cascades, nested savepoints, rollback, deferred commit failure, replacement deletes, partial FAIL changes, subscription cleanup, prepopulated snapshots, schema rollback, view dependency changes, protected observation objects, business trigger preservation, COUNT dependencies, Drizzle methods, heavy writes, multi-tab ownership and reload persistence.

Schema work suspends internal observation triggers inside its transaction, then reinstalls them. This supports DROP COLUMN and avoids duplicate old table names after renames. No-op schema commands retain observation. Runtime PRAGMA mutations are rejected to avoid silently changing SELECT semantics; metadata PRAGMAs can be read through execute. Generic core initialization does not remove application business triggers. Only the demo's explicit upgrade migration removes the old trigger names. The unfinished shared-service code and framework-coupled engine were removed from production sources; the complete relevant legacy backend remains test-only for reproducible comparisons.

## Sources

- [SQLite preupdate hooks](https://sqlite.org/c3ref/preupdate_hook.html)
- [SQLite update hooks](https://sqlite.org/c3ref/update_hook.html)
- [SQLite commit and rollback hooks](https://sqlite.org/c3ref/commit_hook.html)
- [SQLite authorizer](https://sqlite.org/c3ref/set_authorizer.html)
- [SQLite session extension](https://sqlite.org/sessionintro.html)
- [SQLite WASM persistence](https://sqlite.org/wasm/doc/trunk/persistence.md)
- [Dedicated-worker restriction for sync access handles](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createSyncAccessHandle)
