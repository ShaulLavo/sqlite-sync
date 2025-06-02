import type { Client, Row } from '@libsql/client'

export async function generateTriggersForTable(
	client: Client,
	tableName: string
) {
	if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
		throw new Error(`Invalid table name: ${tableName}`)
	}
	// PRAGMA’s syntax won’t let you use placeholders for identifier
	const res = await client.execute(`PRAGMA table_info(${tableName});`)
	const columns = res.columns as string[]
	const rawRows = res.rows as Row[]
	const tableInfo = rawRows.map(row => {
		const obj: Record<string, any> = {}
		for (let i = 0; i < columns.length; i++) {
			obj[columns[i]] = row[i]
		}
		return obj
	})

	// 2) Identify PK columns (pk > 0)
	const pkCols = tableInfo
		.filter(col => col.pk > 0)
		.sort((a, b) => a.pk - b.pk)
		.map(col => col.name as string)

	if (!pkCols.length) {
		throw new Error(`Table "${tableName}" has no primary key—cannot log.`)
	}

	// 3) List all column names
	const allCols = tableInfo.map(col => col.name as string)

	// 4) Build JSON constructor for PK only
	function jsonPk(prefix: 'NEW' | 'OLD') {
		const pairs = pkCols.map(col => `'${col}', ${prefix}.${col}`).join(', ')
		return `json_object(${pairs})`
	}

	// 5) Build JSON constructor for entire row
	function jsonRow(prefix: 'NEW' | 'OLD') {
		const pairs = allCols.map(col => `'${col}', ${prefix}.${col}`).join(', ')
		return `json_object(${pairs})`
	}

	// 6) Create triggers that insert (tbl_name, op_type, pk_json, row_json)
	const trgInsert = `
	CREATE TRIGGER IF NOT EXISTS trg_${tableName}_insert
	AFTER INSERT ON ${tableName}
	BEGIN
	  INSERT INTO change_log (tbl_name, op_type, pk_json, row_json)
	  VALUES (
	    '${tableName}',
	    'INSERT',
	    ${jsonPk('NEW')},
	    ${jsonRow('NEW')}
	  );
	END;`

	const trgUpdate = `
	CREATE TRIGGER IF NOT EXISTS trg_${tableName}_update
	AFTER UPDATE ON ${tableName}
	BEGIN
	  INSERT INTO change_log (tbl_name, op_type, pk_json, row_json)
	  VALUES (
	    '${tableName}',
	    'UPDATE',
	    ${jsonPk('NEW')},
	    ${jsonRow('NEW')}
	  );
	END;`

	const trgDelete = `
	CREATE TRIGGER IF NOT EXISTS trg_${tableName}_delete
	BEFORE DELETE ON ${tableName}
	BEGIN
	  INSERT INTO change_log (tbl_name, op_type, pk_json, row_json)
	  VALUES (
	    '${tableName}',
	    'DELETE',
	    ${jsonPk('OLD')},
	    ${jsonRow('OLD')}
	  );
	END;`

	// 7) Execute
	await client.execute(trgInsert)
	await client.execute(trgUpdate)
	await client.execute(trgDelete)
}
