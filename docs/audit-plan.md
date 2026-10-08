# Reactive SQLite audit

Status: Approved

Done means the demo builds with strict TypeScript checks, real SQLite tests prove committed event ordering and rollback semantics, browser tests prove worker ownership and persistence, repeatable benchmarks compare the legacy and new paths, and a reviewed branch is pushed with a pull request targeting main.

1. Capture legacy behavior and timings before changing the engine. Inspect available WASM hooks and browser constraints.
2. Compare native hooks, transactional temporary triggers, and durable logging. Choose the smallest design that preserves rollback and savepoints.
3. Implement committed notifications, atomic snapshot subscriptions, shared query work, and Solid cleanup. Keep durable records separate.
4. Establish single connection ownership across tabs, explicit fallback behavior, and worker error propagation.
5. Exercise mutations, constraints, cascades, rollback, savepoints, lifecycle, heavy writes, reloads, and the demo in real browsers. Measure the same workloads against the preserved legacy path.
6. Critically review the complete diff and evidence, fix findings, rerun checks, document limits, commit, push, and open the PR. Do not merge.

The highest-risk checks concern transaction visibility and exclusive OPFS ownership. Benchmark speed alone cannot pass those gates. No remote synchronization server is in scope.

Additional scope: the core is a standalone framework-neutral TypeScript library, with an optional Solid adapter. Replace the demo with a developer playground, making persisted Game of Life, live SQL, table inspection, subscriptions, actual commit metrics and bounded change visualization the primary interactions.
