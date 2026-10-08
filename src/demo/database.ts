import { openDatabase } from '../core'
import { migrationStatements } from '../consts/migrations'
import type { ReactiveDatabase, Row } from '../core/types'

export const WIDTH = 48
export const HEIGHT = 24

export function connectDemo(): ReactiveDatabase {
	return openDatabase({
		migrations: migrationStatements.map(({ id, sql }) => ({ id, sql })),
		durableLog: true
	})
}

export function numeric(row: Row, key: string): number {
	const value = row[key]
	if (typeof value !== 'number') throw new Error(`Expected numeric ${key}`)
	return value
}

export function textValue(row: Row, key: string): string {
	const value = row[key]
	if (typeof value !== 'string') throw new Error(`Expected text ${key}`)
	return value
}

const seedCoordinates = [
	[8, 9], [9, 10], [7, 11], [8, 11], [9, 11],
	[20, 10], [21, 10], [22, 10], [23, 9], [23, 11], [24, 10],
	[34, 7], [35, 7], [36, 7], [34, 8], [35, 9]
]


export async function initializeDemo(db: ReactiveDatabase) {
	await db.ready
	await db.execute('CREATE TABLE IF NOT EXISTS demo_meta (id INTEGER PRIMARY KEY, generation INTEGER NOT NULL DEFAULT 0)')
	await db.batch([
		{ sql: 'INSERT OR IGNORE INTO demo_meta (id, generation) VALUES (1, 0)' },
		{ sql: `WITH RECURSIVE xs(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM xs WHERE x<${WIDTH - 1}), ys(y) AS (VALUES(0) UNION ALL SELECT y+1 FROM ys WHERE y<${HEIGHT - 1}) INSERT INTO cells(x,y,alive) SELECT x,y,CASE WHEN (x,y) IN (${seedCoordinates.map(([x, y]) => `(${x},${y})`).join(',')}) THEN 1 ELSE 0 END FROM xs CROSS JOIN ys WHERE NOT EXISTS(SELECT 1 FROM cells)` },
		{ sql: "INSERT INTO users(name,email,bio) SELECT 'Ada Lovelace','ada@example.test','Writes algorithms. Watches SQLite.' WHERE NOT EXISTS(SELECT 1 FROM users)" }
	])
}

export const stepSql = `WITH next AS MATERIALIZED (
  SELECT c.x, c.y,
    CASE WHEN COUNT(n.x) = 3 OR (c.alive = 1 AND COUNT(n.x) = 2)
      THEN 1 ELSE 0 END AS alive
  FROM cells c
  LEFT JOIN cells n ON n.alive = 1
    AND n.x BETWEEN c.x - 1 AND c.x + 1
    AND n.y BETWEEN c.y - 1 AND c.y + 1
    AND (n.x != c.x OR n.y != c.y)
  GROUP BY c.x, c.y
)
UPDATE cells SET alive = (SELECT alive FROM next WHERE next.x = cells.x AND next.y = cells.y)
WHERE alive IS NOT (SELECT alive FROM next WHERE next.x = cells.x AND next.y = cells.y)`

export async function stepGeneration(db: ReactiveDatabase) {
	await db.batch([
		{ sql: stepSql },
		{ sql: 'UPDATE demo_meta SET generation = generation + 1 WHERE id = 1' }
	])
}

export async function resetGeneration(db: ReactiveDatabase) {
	await db.batch([
		{ sql: `UPDATE cells SET alive = CASE WHEN (x,y) IN (${seedCoordinates.map(([x, y]) => `(${x},${y})`).join(',')}) THEN 1 ELSE 0 END` },
		{ sql: 'UPDATE demo_meta SET generation = 0 WHERE id = 1' }
	])
}
