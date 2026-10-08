import { openDatabase } from '../core'
import { migrationStatements } from '../consts/migrations'
import type { ReactiveDatabase, Row } from '../core/types'

export const WIDTH = 96
export const HEIGHT = 54

export function connectDemo(): ReactiveDatabase {
	return openDatabase({
		migrations: [...migrationStatements.map(({ id, sql }) => ({ id, sql })), {
			id: 'reactive-core-v1',
			sql: ['cells', 'users', 'posts', 'migrations'].flatMap(table => ['insert', 'update', 'delete', 'skip_noop'].map(operation => `DROP TRIGGER IF EXISTS trg_${table}_${operation}`))
		}],
		legacyJournal: { table: 'migrations', column: 'name' },
		durableLog: true
	})
}

export function numeric(row: Row, key: string): number {
	const value = row[key]
	if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Expected numeric ${key}`)
	return value
}

export function textValue(row: Row, key: string): string {
	const value = row[key]
	if (typeof value !== 'string') throw new Error(`Expected text ${key}`)
	return value
}

const gliderGun = [
	[24, 0], [22, 1], [24, 1], [12, 2], [13, 2], [20, 2], [21, 2], [34, 2], [35, 2], [11, 3], [15, 3], [20, 3], [21, 3], [34, 3], [35, 3],
	[0, 4], [1, 4], [10, 4], [16, 4], [20, 4], [21, 4], [0, 5], [1, 5], [10, 5], [14, 5], [16, 5], [17, 5], [22, 5], [24, 5],
	[10, 6], [16, 6], [24, 6], [11, 7], [15, 7], [12, 8], [13, 8]
]
const acorn = [[0, 1], [1, 3], [2, 0], [2, 1], [4, 1], [5, 1], [6, 1]]

export type Pattern = 'soup' | 'guns' | 'acorn' | 'clear'

function cellList(points: number[][]) {
	return points.map(([x, y]) => `(${((x % WIDTH) + WIDTH) % WIDTH},${((y % HEIGHT) + HEIGHT) % HEIGHT})`).join(',')
}

function patternSql(pattern: Pattern): string {
	if (pattern === 'clear') return 'UPDATE cells SET alive = 0 WHERE alive = 1'
	if (pattern === 'soup') return `UPDATE cells SET alive = CASE WHEN abs(random()) % 100 < 22 AND x BETWEEN 8 AND ${WIDTH - 9} AND y BETWEEN 6 AND ${HEIGHT - 7} THEN 1 ELSE 0 END`
	const points = pattern === 'acorn'
		? acorn.map(([x, y]) => [x + WIDTH / 2 - 3, y + HEIGHT / 2 - 2])
		: [...gliderGun.map(([x, y]) => [x + 4, y + 4]), ...gliderGun.map(([x, y]) => [WIDTH - 5 - x, HEIGHT - 5 - y])]
	return `UPDATE cells SET alive = CASE WHEN (x, y) IN (VALUES ${cellList(points)}) THEN 1 ELSE 0 END WHERE alive = 1 OR (x, y) IN (VALUES ${cellList(points)})`
}

export async function initializeDemo(db: ReactiveDatabase) {
	await db.ready
	await db.execute('CREATE TABLE IF NOT EXISTS demo_meta (id INTEGER PRIMARY KEY, generation INTEGER NOT NULL DEFAULT 0)')
	const [, , empty] = await db.batch([
		{ sql: 'INSERT OR IGNORE INTO demo_meta (id, generation) VALUES (1, 0)' },
		{ sql: "INSERT INTO users(name,email,bio) SELECT 'Ada Lovelace','ada@example.test','Writes algorithms. Watches SQLite.' WHERE NOT EXISTS(SELECT 1 FROM users)" },
		{ sql: 'SELECT NOT EXISTS(SELECT 1 FROM cells WHERE alive = 1) AS empty' }
	])
	await db.execute(`WITH RECURSIVE xs(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM xs WHERE x<${WIDTH - 1}), ys(y) AS (VALUES(0) UNION ALL SELECT y+1 FROM ys WHERE y<${HEIGHT - 1}) INSERT OR IGNORE INTO cells(x,y,alive) SELECT x,y,0 FROM xs CROSS JOIN ys`)
	await db.execute(`DELETE FROM cells WHERE x >= ${WIDTH} OR y >= ${HEIGHT}`)
	if (empty.rows[0]?.[0] === 1) await applyPattern(db, 'guns')
}

// Weighted 3x3 sum over living cells only: neighbours count 2, the cell itself 1.
// 5 or 7 keeps a cell alive, 6 gives birth; every other odd sum is a death.
export const stepSql = `WITH d(v) AS (VALUES (-1), (0), (1)),
flip AS MATERIALIZED (
  SELECT (c.x + dx.v + ${WIDTH}) % ${WIDTH} AS x,
         (c.y + dy.v + ${HEIGHT}) % ${HEIGHT} AS y,
         SUM(CASE WHEN dx.v = 0 AND dy.v = 0 THEN 1 ELSE 2 END) AS s
  FROM cells c, d dx, d dy
  WHERE c.alive = 1
  GROUP BY 1, 2
  HAVING s = 6 OR (s % 2 = 1 AND s NOT IN (5, 7))
)
UPDATE cells SET alive = 1 - cells.alive
FROM flip
WHERE flip.x = cells.x AND flip.y = cells.y`

export async function stepGeneration(db: ReactiveDatabase) {
	await db.batch([
		{ sql: stepSql },
		{ sql: 'UPDATE demo_meta SET generation = generation + 1 WHERE id = 1' }
	])
}

export async function applyPattern(db: ReactiveDatabase, pattern: Pattern) {
	await db.batch([
		{ sql: patternSql(pattern) },
		{ sql: 'UPDATE demo_meta SET generation = 0 WHERE id = 1' }
	])
}
