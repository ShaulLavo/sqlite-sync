import type { Client } from '@libsql/client'
import * as schema from '../sqlite/schema'
import { type SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core'

function isSqliteTable(t: any): t is SQLiteTable<any> {
	return t && typeof t.getSQL === 'function' && Boolean(t.getSQL())
}

export async function generateAllTriggers(client: Client) {
	const tables = Object.values(schema).filter(isSqliteTable)

	for (const tbl of tables) {
		const { name: tblName, columns, primaryKeys } = getTableConfig(tbl)
		if (tblName === 'change_log') continue

		const allCols = columns.map(c => c.name)
		const dynamicPkCols =
			primaryKeys?.flatMap(pk => pk.columns?.map(c => c.name) ?? []) ?? []
		const pkCols = [
			...columns.filter(c => c.primary).map(c => c.name),
			...dynamicPkCols
		]
		const dataCols = allCols.filter(
			c => !['created_at', 'updated_at', 'changed_at'].includes(c)
		)

		const jsonPk = (p: 'NEW' | 'OLD') =>
			`json_object(${pkCols.map(c => `'${c}', ${p}.${c}`).join(', ')})`
		const jsonRow = (p: 'NEW' | 'OLD') =>
			`json_object(${allCols.map(c => `'${c}', ${p}.${c}`).join(', ')})`

		for (const op of ['insert', 'skip_noop', 'update', 'delete'] as const) {
			await client.execute(`DROP TRIGGER IF EXISTS trg_${tblName}_${op};`)
		}

		for (const opType of ['INSERT', 'UPDATE', 'DELETE'] as const) {
			const timing = 'AFTER'
			const ref = opType === 'DELETE' ? 'OLD' : 'NEW'
			await client.execute(/*sql*/ `
        CREATE TRIGGER trg_${tblName}_${opType.toLowerCase()}
        ${timing} ${opType} ON "${tblName}"
        FOR EACH ROW
        BEGIN
          INSERT INTO change_log(tbl_name, op_type, pk_json, row_json)
          VALUES (
            '${tblName}', '${opType}',
            ${jsonPk(ref)}, ${jsonRow(ref)}
          );
        END;
      `)
		}

		// add skip-noop only for UPDATE
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

		// global truncate
		// 	await client.execute(/*sql*/ `
		//   CREATE TRIGGER IF NOT EXISTS change_log_auto_truncate
		//   AFTER INSERT ON change_log
		//   WHEN ( (SELECT COUNT(*) FROM change_log) > 1000 )
		//   BEGIN
		//     DELETE FROM change_log
		//     WHERE id IN (
		//       SELECT id
		//         FROM change_log
		//       ORDER BY id ASC
		//       LIMIT (SELECT COUNT(*) - 1000 FROM change_log)
		//     );
		//   END;
		// `)
	}
}
