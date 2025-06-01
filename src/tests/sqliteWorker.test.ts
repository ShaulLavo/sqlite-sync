// src/tests/sqliteWorker.test.ts
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import * as Comlink from 'comlink'
import type { Api } from '../sqliteWorker'

let api: Api
let workerInstance: Worker
const TEST_TABLE = 'vitest_users'

beforeAll(async () => {
	workerInstance = new Worker(new URL('../sqliteWorker.ts', import.meta.url), {
		type: 'module'
	})
	api = Comlink.wrap<Api>(workerInstance)
	await api.clientReady
})

afterAll(() => {
	workerInstance.terminate()
})

describe('sqliteWorker Api', () => {
	it('ping() should return a string', async () => {
		const res = await api.ping()
		expect(typeof res).toBe('string')
	})

	it('should CREATE, INSERT, and SELECT rows correctly in test table', async () => {
		// Drop and recreate the test table
		await api.run(`DROP TABLE IF EXISTS ${TEST_TABLE};`)
		await api.run(`
      CREATE TABLE IF NOT EXISTS ${TEST_TABLE} (
        id    INTEGER PRIMARY KEY,
        name  TEXT,
        email TEXT
      );
    `)

		// Insert a row
		await api.run(`INSERT INTO ${TEST_TABLE}(name, email) VALUES (?, ?);`, [
			'vitest_user',
			'vitest@example.com'
		])

		// Select that row back
		const selectResult = await api.run(
			`SELECT id, name, email FROM ${TEST_TABLE} WHERE email = ?;`,
			['vitest@example.com']
		)
		expect(Array.isArray(selectResult.rows)).toBe(true)
		expect(selectResult.rows.length).toBe(1)

		const row = selectResult.rows[0]
		expect(row.name).toBe('vitest_user')
		expect(row.email).toBe('vitest@example.com')
		expect(typeof row.id).toBe('number')
	})

	it('should DELETE a row and confirm it’s gone from test table', async () => {
		// Insert another row to delete
		await api.run(`INSERT INTO ${TEST_TABLE}(name, email) VALUES (?, ?);`, [
			'to_delete',
			'delete_me@example.com'
		])

		// Delete that row
		await api.run(`DELETE FROM ${TEST_TABLE} WHERE email = ?;`, [
			'delete_me@example.com'
		])

		// Confirm zero rows
		const postDelete = await api.run(
			`SELECT id FROM ${TEST_TABLE} WHERE email = ?;`,
			['delete_me@example.com']
		)
		expect(Array.isArray(postDelete.rows)).toBe(true)
		expect(postDelete.rows.length).toBe(0)
	})
})
