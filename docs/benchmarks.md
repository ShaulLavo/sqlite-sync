# Browser benchmarks

## Method

Executed on 2026-10-08 using headless Chromium 153 on Linux, Intel Core i7-14700K, 28 logical CPUs. Browser profile scratch uses the host tmpfs `/tmp`; OPFS measurements therefore characterize browser filesystem/commit overhead on this host, not physical SSD durability latency. Shared-host scheduling and CPU frequency introduce noise. The raw samples are committed in [benchmark-results.json](evidence/benchmark-results.json) and [concurrent-results.json](evidence/concurrent-results.json).

Run `CHROMIUM_PATH=/path/to/chromium bun run bench`. The harness uses real SQLite WASM, workers, Comlink, OPFS SAH pools and Solid stores. Port 5179 is isolated from UI verification and HMR is disabled. One warmup precedes seven timed samples per SQLite workload. Medians, minima and maxima remain in the JSON. A native preupdate probe copies row values but does not implement rollback reconciliation, durable tracking or query management; it is exploratory, not a shipping alternative.

For the SQLite comparison, all strategies use official SQLite 3.49.2, the same schema and SAH pool. `legacy` means the old trigger/log algorithm transplanted onto that engine, avoiding a WASM-version confound. `bare` does no observation. `temporary` includes the new engine, authorizer, lossless encoding, draining and bounded statement cache, without persistent logs. `temporary+durable` enables the independent durable recorder. No query subscribers exist in this section, so it measures execution and observation cost.

Each insert/update/delete workload performs 100 of each operation in separate commits. Replacement bulk insert deletes 5,000 existing rows and inserts 5,000 new ones; it is 10,000 observed operations. Literal batches use 1,000 distinct SQL strings. Parameterized batches repeat one SQL string with 1,000 bound keys. Persistent legacy logs grow during a strategy run, matching the old implementation's retention behavior.

## SQLite workload medians

All values are milliseconds for the complete workload.

| Workload | Bare | Legacy log | TEMP | TEMP + durable | Native probe |
| --- | ---: | ---: | ---: | ---: | ---: |
| single insert/update/delete x100 | 1203.20 | 1374.80 | 624.20 | 1000.30 | 748.40 |
| 5000-row bulk update | 16.10 | 40.10 | 32.90 | 51.20 | 14.00 |
| 1000 statements / transaction | 16.00 | 35.60 | 138.60 | 259.30 | 9.70 |
| 1000 parameterized statements / transaction | 19.60 | 32.20 | 16.00 | 26.50 | 8.60 |
| 5000-row replacement insert | 14.50 | 98.00 | 76.80 | 148.90 | 50.50 |

Bound parameters let the cache reuse compiled trigger and authorization work. Distinct literal batches exceed the bounded cache and are substantially slower than the legacy log algorithm. This is a shipped tradeoff, not an omitted result. The demo computes Life in one set-based SQL statement; Drizzle uses bound parameters. Durable logging adds I/O and row encoding and is opt-in. TEMP still adds real overhead versus bare SQLite.

## Worker delivery

This section runs the actual preserved libsql 3.45.1 legacy worker against the new official 3.49.2 worker. It therefore measures the complete shipped paths and is not an isolated SQLite-algorithm comparison. Each case performs 100 individual insert commits and 100 `SELECT 1` round trips. Legacy cases reuse `local.db` and an accumulating log; new cases use fresh databases. That can mildly disadvantage later legacy cases. Notifications are awaited before the next sample. Timer resolution can round very short read round trips to zero; zero does not mean free communication.

| Subscribers | Dependencies | Legacy notification p50 / p95 ms | New notification p50 / p95 ms |
| ---: | --- | ---: | ---: |
| 1 | same tables | 4.30 / 6.10 | 3.30 / 5.00 |
| 1 | different tables | 3.60 / 6.10 | 3.50 / 5.20 |
| 20 | same tables | 4.50 / 6.30 | 3.90 / 5.90 |
| 20 | different tables | 4.30 / 6.70 | 3.30 / 5.20 |

Identical table subscribers share one core collection in the page and one worker subscription. Final affected rows are fetched after commit so cascades cannot replay stale trigger images. Generic queries remain selective. The same- and different-table cases verify notification counts, not just time.

## Collection and query work

The 10,000-row collection test updates the final 1,000 rows per commit. Three expensive old-store reconciliation samples are compared with the new adapter on the same row changes. The old `findIndex` and per-row `produce` algorithm measured **3191.90 ms median** versus **6.30 ms** for the new mapped and batched reconcile. This isolates application store work, does not include browser paint, and deliberately exercises the old algorithm's worst search positions. Final values are compared. Three samples are too few for a stable tail estimate; raw values remain available.

A filtered, grouped, ordered, limited LEFT JOIN over 5,000 owners and 10,000 entries updates 500 entries per commit for ten commits. Median SQL execution was 1.00 ms, change decoding 2.10 ms, and reactive query work 0.60 ms. Its final diagnostics record SQL executions and invalidations. This is a new-path workload, without a directly comparable legacy generic-query layer.

Two browser tabs perform 50 commits each against one persisted counter and both reactive queries reach 100. The verified run took 219.25 ms, or 456.1 commits/s. The legacy exclusive SAH ownership cannot run this concurrent workload correctly, so no legacy number is fabricated.

## Memory

The WASM heap capacity is 23.12 MiB after sequential strategy runs. SQLite allocator current/peak measurements per strategy are below. Peaks are reset before that strategy's workload. Persistent log growth accounts for much of the legacy allocation. WASM capacity is not live JavaScript heap usage. Chromium did not expose a portable precise cross-worker JS-memory measurement in this harness; the report does not claim one. Collections, live SQL results and transaction queues still scale with their data size.

| Strategy | SQLite current MiB | SQLite peak MiB |
| --- | ---: | ---: |
| bare | 0.36 | 0.39 |
| legacy | 16.24 | 16.39 |
| temporary | 3.54 | 3.68 |
| temporary+durable | 21.10 | 21.25 |
| native-probe | 0.36 | 0.39 |

## Verification and limits

The benchmark suite completed with both tests passing. Early harness runs failed due to legacy worker initialization, HMR reloads, and concurrent Playwright output-directory cleanup. Those runs were not treated as passing. The final harness isolates its server and output directory and checkpoints completed phases.

Correctness gates are separate from timing. The full verification command covers transaction ordering, rollback/savepoints, cascade snapshots, lifecycle, persistence, schema changes and framework independence. Measurements are Chromium-only, with no claims for Safari, Firefox, mobile-device performance, disk-crash durability, or browser paint latency. No custom WASM compilation was performed.
