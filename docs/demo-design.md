# Demo design

The demo makes one claim and lets the visitor check it: a database can drive a real-time UI. Conway's Game of Life is the workload because every generation rewrites hundreds of rows, and the result is visible at a glance.

## Page

1. **Intro.** "Every cell is a row. Every generation is a transaction."
2. **Board.** A 96 × 54 wrapped grid; each cell is a row in `cells`. The canvas draws only from the `cells` live table subscription, including the visitor's own strokes, so there is no local game state to fall back on. Recently dead cells leave a short trail.
3. **Controls.** Run/pause, single step, speed (2, 10, 30 or unthrottled), and patterns (glider guns, random soup, acorn, clear). Dragging paints cells; strokes are batched into one `UPDATE` per animation frame.
4. **Live timings.** SQL step time (`executionMs` from the commit event), commit → pixels (worker commit timestamp to the canvas paint of that revision), rows changed per commit and measured generations per second. A chart shows the last 120 generations. These are the visitor's numbers, not lab numbers.
5. **The rules in SQL.** The step query, shown in full.
6. **Commit pipeline.** Worker counters (commits, captured rows, invalidations, query runs), the latest row changes and the registered live subscriptions.
7. **Console.** Queries stay subscribed; other statements run once.
8. **Lab benchmarks.** Selected results from `docs/benchmarks.md`, including the regression.

## Step query

The step scans living cells only. Each adds 2 to its eight neighbours and 1 to itself; grouping by position gives a sum where 5 or 7 means survive, 6 means birth, and any other odd value means death. Only those flips are written with `UPDATE … FROM`. On a 96 × 54 grid this took about 4 ms in native SQLite, against about 220 ms for the earlier join-based query.

## Visual language

Near-black background, one signal orange for living cells and primary actions, warm off-white text. Geist for text, Geist Mono for numbers and labels. Motion is limited to press feedback and hover color; repeated data updates are immediate, and reduced motion removes transitions.

## Hosting

`.github/workflows/pages.yml` builds with `PAGES_BASE=/sqlite-sync/` and deploys `dist` to GitHub Pages on every push to `main`. `404.html` is a copy of `index.html` so client routes resolve.
