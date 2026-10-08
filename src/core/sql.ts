export function assertSingleStatement(sql: string, complete: (sql: string) => number): void {
	if (!sql.includes(';')) return
	let quoted = ''
	let lineComment = false
	let blockComment = false
	let ended = false
	for (let i = 0; i < sql.length; i++) {
		const char = sql[i]
		const next = sql[i + 1]
		if (lineComment) { if (char === '\n') lineComment = false; continue }
		if (blockComment) { if (char === '*' && next === '/') { blockComment = false; i++ }; continue }
		if (quoted) {
			if (char !== quoted) continue
			if (next === quoted) { i++; continue }
			quoted = ''; continue
		}
		if (char === '-' && next === '-') { lineComment = true; i++; continue }
		if (char === '/' && next === '*') { blockComment = true; i++; continue }
		if (/\s/.test(char)) continue
		if (ended) throw new Error('Execute one SQL statement at a time. Use batch() for atomic multi-statement work.')
		if (char === ';') { ended = Boolean(complete(sql.slice(0, i + 1))); continue }
		if (char === "'" || char === '"' || char === '`') quoted = char
		if (char === '[') quoted = ']'
	}
}
