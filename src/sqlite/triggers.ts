import type { Client } from '@libsql/client'
import * as schema from '../sqlite/schema'
import { type SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core'

function isSqliteTable(t: any): t is SQLiteTable<any> {
	return t && typeof t.getSQL === 'function' && Boolean(t.getSQL())
}

export async function generateAllTriggers(client: Client) {
	const tables = Object.values(schema).filter(isSqliteTable)

	for (const tbl of tables) {
		const { name: tblName, columns } = getTableConfig(tbl)
		if (tblName === 'change_log') continue

		const allCols = columns.map(c => c.name)
		const pkCols = columns.filter(c => c.primary).map(c => c.name)
		const dataCols = allCols.filter(
			c => !['created_at', 'updated_at', 'changed_at'].includes(c)
		)

		const jsonPk = (p: 'NEW' | 'OLD') =>
			`json_object(${pkCols.map(c => `'${c}', ${p}.${c}`).join(', ')})`
		const jsonRow = (p: 'NEW' | 'OLD') =>
			`json_object(${allCols.map(c => `'${c}', ${p}.${c}`).join(', ')})`

		// drop old
		await client.execute(`DROP TRIGGER IF EXISTS trg_${tblName}_insert;`)
		await client.execute(`DROP TRIGGER IF EXISTS trg_${tblName}_skip_noop;`)
		await client.execute(`DROP TRIGGER IF EXISTS trg_${tblName}_update;`)
		await client.execute(`DROP TRIGGER IF EXISTS trg_${tblName}_delete;`)

		// INSERT
		await client.execute(/*sql*/ `
      CREATE TRIGGER trg_${tblName}_insert
      AFTER INSERT ON "${tblName}"
      FOR EACH ROW
      BEGIN
        INSERT INTO change_log(tbl_name, op_type, pk_json, row_json)
        VALUES (
          '${tblName}', 'INSERT',
          ${jsonPk('NEW')}, ${jsonRow('NEW')}
        );
      END;
    `)

		// SKIP NO-OPs
		const noopCond = dataCols.map(c => `NEW.${c} = OLD.${c}`).join(' AND ')
		await client.execute(/*sql*/ `
      CREATE TRIGGER trg_${tblName}_skip_noop
      BEFORE UPDATE ON "${tblName}"
      FOR EACH ROW
      WHEN ${noopCond}
      BEGIN
        SELECT RAISE(IGNORE);
      END;
    `)

		// UPDATE (only real diffs make it here)
		await client.execute(/*sql*/ `
      CREATE TRIGGER trg_${tblName}_update
      AFTER UPDATE ON "${tblName}"
      FOR EACH ROW
      BEGIN
        INSERT INTO change_log(tbl_name, op_type, pk_json, row_json)
        VALUES (
          '${tblName}', 'UPDATE',
          ${jsonPk('NEW')}, ${jsonRow('NEW')}
        );
      END;
    `)

		// DELETE
		await client.execute(/*sql*/ `
      CREATE TRIGGER trg_${tblName}_delete
      BEFORE DELETE ON "${tblName}"
      FOR EACH ROW
      BEGIN
        INSERT INTO change_log(tbl_name, op_type, pk_json, row_json)
        VALUES (
          '${tblName}', 'DELETE',
          ${jsonPk('OLD')}, ${jsonRow('OLD')}
        );
      END;
    `)

		await client.execute(/*sql*/ `
    CREATE TRIGGER IF NOT EXISTS change_log_auto_truncate
    AFTER INSERT ON change_log
    WHEN ( (SELECT COUNT(*) FROM change_log) > 1000 )
    BEGIN
      DELETE FROM change_log
      WHERE id IN (
        -- delete the oldest rows beyond the newest 1000
        SELECT id
          FROM change_log
        ORDER BY id ASC
        LIMIT (SELECT COUNT(*) - 1000 FROM change_log)
      );
    END;
`)
	}
}
