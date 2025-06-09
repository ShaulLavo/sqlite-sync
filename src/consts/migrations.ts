
	export interface MigrationStatement {
		version: number
		id: string
		sql: string[]
	}

	export const migrationStatements: MigrationStatement[] = [
  {
    "version": 0,
    "id": "bitter_wallflower",
    "sql": [
      "CREATE TABLE `cells` (\n\t`x` integer NOT NULL,\n\t`y` integer NOT NULL,\n\t`alive` integer DEFAULT false NOT NULL,\n\tPRIMARY KEY(`x`, `y`)\n);",
      "CREATE TABLE `change_log` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`tbl_name` text NOT NULL,\n\t`op_type` text NOT NULL,\n\t`pk_json` text NOT NULL,\n\t`row_json` text NOT NULL,\n\t`changed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL\n);",
      "CREATE TABLE `migrations` (\n\t`name` text PRIMARY KEY NOT NULL,\n\t`applied_at` text DEFAULT (current_timestamp) NOT NULL\n);",
      "CREATE TABLE `posts` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`author_id` integer NOT NULL,\n\t`title` text NOT NULL,\n\t`body` text NOT NULL,\n\t`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,\n\t`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,\n\tFOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE TABLE `users` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`name` text NOT NULL,\n\t`email` text NOT NULL,\n\t`picture` text,\n\t`bio` text,\n\t`location` text,\n\t`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,\n\t`is_active` integer DEFAULT true\n);",
      "CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);"
    ]
  }
] 
