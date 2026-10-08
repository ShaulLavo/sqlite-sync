# Demo design

## Two layout sketches

**A. Lab notebook**

```
sqlite-sync                         Playground   Source
Reactive SQLite. Watch it work.
Life simulation | SQL playground | Tables
┌─────────────────────────────────┬─────────────────┐
│ Generation / live population   │ SQLite → query  │
│ Large persisted Life board     │ → Solid render  │
│ Play / step / reset / speed    │ Real counters   │
└─────────────────────────────────┴─────────────────┘
Committed changes                Subscription inspector
```

A large interactive board carries the page. SQL, tables and subscriptions are reachable in one click. Paper colors, thin rules, generous margins and a restrained green accent make technical information readable.

**B. Database workbench**

```
sqlite-sync | connected                  Export database
┌─────────┬───────────────────────────┬────────────────┐
│ Tables  │ SQL editor                │ Life preview   │
│ cells   ├───────────────────────────┤ Metrics        │
│ users   │ Live result table         │ Subscriptions  │
│ posts   ├───────────────────────────┴────────────────┤
│ meta    │ Committed change stream                    │
└─────────┴────────────────────────────────────────────┘
```

This favors experienced SQL users but makes Life secondary and needs more horizontal space.

## Selected design

Use A. It explains the library through one action: a generation writes SQLite, commits changes, updates subscribed rows, and redraws the board. The SQL tab retains the editor and live results. The tables tab retains user creation, editing and deletion.

Counters come from the worker inspection API, commit events and Solid adapter. Delivery latency is page event receipt minus the worker's commit timestamp. Reconciliation time measures the adapter's store update, while canvas draw time measures the board renderer. Neither claims to measure browser paint time. The event feed keeps at most 80 row changes, and distinguishes commit revisions from row operations.

Game steps run a materialized next-state computation inside SQLite. The cell update and generation increment commit atomically. Existing cells survive page reloads; a new empty database receives a seed once. Reset is explicit.

Motion is limited to 120 ms pointer press feedback and a 200 ms initial page entry. Repeated data updates and keyboard actions remain immediate. Reduced motion disables movement. The palette uses warm near-white backgrounds, dark neutral ink and green with sufficient text contrast. Status also has a text label.
