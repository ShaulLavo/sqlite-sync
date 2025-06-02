declare module 'sqlite-parser' {
	export type ExpressionNode =
		| LiteralNode
		| VariableNode
		| BinaryOperationNode
		| ExpressionListNode
	type TransactionStatementNode = {
		type: 'statement'
		variant: 'transaction'
		action: 'begin' | 'commit' | 'rollback'
		defer?: 'deferred' | 'immediate' | 'exclusive' // only for 'begin'
	}
	type LiteralNode = {
		type: 'literal'
		variant: 'string' | 'decimal' | 'integer' | 'boolean' | 'null'
		value: string | number | boolean | null
		normalized?: string
	}
	export type ExpressionListNode = {
		type: 'expression'
		variant: 'list'
		expression: ExpressionNode[]
	}

	export type BinaryOperationNode = {
		type: 'expression'
		format: 'binary'
		variant: 'operation'
		operation: '=' | '!=' | '<' | '<=' | '>' | '>=' | 'AND' | 'OR' // extend as needed
		left: ExpressionNode
		right: ExpressionNode
	}
	export type VariableNode = {
		type: 'variable'
		format: 'numbered' | 'named'
		name: string // e.g. "?" or ":id"
	}
	export type TableInsertTargetNode = {
		type: 'identifier'
		variant: 'expression'
		format: 'table'
		name: string
		columns: ColumnIdentifierNode[]
	}
	export type AssignmentNode = {
		type: 'assignment'
		target: ColumnIdentifierNode
		value: ExpressionNode
	}

	type PragmaStatementNode = {
		type: 'statement'
		variant: 'pragma'
		target: {
			type: 'identifier'
			variant: 'pragma'
			name: string
		}
		args?: ExpressionNode | ExpressionListNode
	}
	export type InsertStatementNode = {
		type: 'statement'
		variant: 'insert'
		action: 'insert'
		into: TableInsertTargetNode
		result: ExpressionListNode[]
	}

	export type DeleteStatementNode = {
		type: 'statement'
		variant: 'delete'
		from: TableIdentifierNode
		where?: ExpressionNode[]
	}
	export type UpdateStatementNode = {
		type: 'statement'
		variant: 'update'
		table: TableIdentifierNode
		set: AssignmentNode[]
		where?: ExpressionNode[]
	}

	export type StatementNode =
		| SelectStatementNode
		| InsertStatementNode
		| DeleteStatementNode
		| UpdateStatementNode
		| PragmaStatementNode
		| TransactionStatementNode

	/** A column identifier, e.g. { type: "identifier", variant: "column", name: "pants" } */
	export interface ColumnIdentifierNode {
		type: 'identifier'
		variant: 'column'
		name: string
	}

	/** A table identifier, e.g. { type: "identifier", variant: "table", name: "laundry" } */
	export interface TableIdentifierNode {
		type: 'identifier'
		variant: 'table'
		name: string
	}

	export interface SelectStatementNode {
		type: 'statement'
		variant: 'select'
		/** the list of selected columns (in your example, one ColumnIdentifierNode) */
		result: ColumnIdentifierNode[]
		/** the FROM clause (in your example, a single TableIdentifierNode) */
		from: TableIdentifierNode

		[extraField: string]: any
	}

	export interface StatementListNode {
		type: 'statement'
		variant: 'list'
		statement: StatementNode[]
		[extraField: string]: any
	}

	/**
	 * Parse a SQL string and synchronously return its AST.
	 * @param source   SQL code to parse
	 * @param options  (optional) parser options
	 * @returns        a StatementListNode
	 */
	function sqliteParser(source: string, options?: any): StatementListNode

	/**
	 * Parse a SQL string asynchronously via callback.
	 * @param source    SQL code to parse
	 * @param options   (optional) parser options
	 * @param callback  callback(err, resultAST)
	 */
	function sqliteParser(
		source: string,
		options: any,
		callback: (err: Error | null, result?: StatementListNode) => void
	): void

	namespace sqliteParser {
		/** Create a streaming parser transform (for Node streams). */
		function createParser(): any

		/** Create a stitcher (single-node transform) for streaming. */
		function createStitcher(): any

		/** Package name. */
		const NAME: string

		/** Package version (string placeholder). */
		const VERSION: string
	}

	export default sqliteParser
}
