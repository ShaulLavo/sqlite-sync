export interface MigrationStatement {
	version: number
	id: string
	sql: string[]
}

export const migrationStatements: MigrationStatement[] = [
  {
    "version": 0,
    "id": "parallel_silhouette",
    "sql": [
      "CREATE TABLE `migrations` (\n\t`name` text PRIMARY KEY NOT NULL,\n\t`applied_at` text DEFAULT (current_timestamp) NOT NULL\n);",
      "CREATE TABLE `posts` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`author_id` integer NOT NULL,\n\t`title` text NOT NULL,\n\t`body` text NOT NULL,\n\t`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,\n\t`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,\n\tFOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE TABLE `users` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`name` text NOT NULL,\n\t`email` text NOT NULL,\n\t`picture` text,\n\t`bio` text,\n\t`location` text,\n\t`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,\n\t`is_active` integer DEFAULT true\n);",
      "CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);"
    ]
  },
  {
    "version": 1,
    "id": "misty_thing",
    "sql": [
      "CREATE TABLE `change_log` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`tbl_name` text NOT NULL,\n\t`op_type` text NOT NULL,\n\t`pk_json` text NOT NULL,\n\t`changed_at` text DEFAULT (current_timestamp) NOT NULL\n);"
    ]
  },
  {
    "version": 2,
    "id": "brave_deathbird",
    "sql": [
      "ALTER TABLE `change_log` ADD `row_json` text NOT NULL;"
    ]
  },
  {
    "version": 3,
    "id": "brainy_unus",
    "sql": [
      "PRAGMA foreign_keys=OFF;",
      "CREATE TABLE `__new_posts` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`author_id` integer NOT NULL,\n\t`title` text NOT NULL,\n\t`body` text NOT NULL,\n\t`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,\n\t`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,\n\tFOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "INSERT INTO `__new_posts`(\"id\", \"author_id\", \"title\", \"body\", \"created_at\", \"updated_at\") SELECT \"id\", \"author_id\", \"title\", \"body\", \"created_at\", \"updated_at\" FROM `posts`;",
      "DROP TABLE `posts`;",
      "ALTER TABLE `__new_posts` RENAME TO `posts`;",
      "PRAGMA foreign_keys=ON;",
      "CREATE TABLE `__new_users` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`name` text NOT NULL,\n\t`email` text NOT NULL,\n\t`picture` text,\n\t`bio` text,\n\t`location` text,\n\t`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,\n\t`is_active` integer DEFAULT true\n);",
      "INSERT INTO `__new_users`(\"id\", \"name\", \"email\", \"picture\", \"bio\", \"location\", \"created_at\", \"is_active\") SELECT \"id\", \"name\", \"email\", \"picture\", \"bio\", \"location\", \"created_at\", \"is_active\" FROM `users`;",
      "DROP TABLE `users`;",
      "ALTER TABLE `__new_users` RENAME TO `users`;",
      "CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);"
    ]
  },
  {
    "version": 4,
    "id": "eager_boomerang",
    "sql": [
      "PRAGMA foreign_keys=OFF;",
      "CREATE TABLE `__new_change_log` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`tbl_name` text NOT NULL,\n\t`op_type` text NOT NULL,\n\t`pk_json` text NOT NULL,\n\t`row_json` text NOT NULL,\n\t`changed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL\n);",
      "INSERT INTO `__new_change_log`(\"id\", \"tbl_name\", \"op_type\", \"pk_json\", \"row_json\", \"changed_at\") SELECT \"id\", \"tbl_name\", \"op_type\", \"pk_json\", \"row_json\", \"changed_at\" FROM `change_log`;",
      "DROP TABLE `change_log`;",
      "ALTER TABLE `__new_change_log` RENAME TO `change_log`;",
      "PRAGMA foreign_keys=ON;"
    ]
  },
  {
    "version": 5,
    "id": "handy_morph",
    "sql": [
      "CREATE TABLE `cells` (\n\t`x` integer,\n\t`y` integer,\n\t`alive` integer DEFAULT false,\n\tPRIMARY KEY(`x`, `y`)\n);"
    ]
  },
  {
    "version": 6,
    "id": "condemned_selene",
    "sql": [
      "PRAGMA foreign_keys=OFF;",
      "CREATE TABLE `__new_cells` (\n\t`x` integer NOT NULL,\n\t`y` integer NOT NULL,\n\t`alive` integer DEFAULT false NOT NULL,\n\tPRIMARY KEY(`x`, `y`)\n);",
      "INSERT INTO `__new_cells`(\"x\", \"y\", \"alive\") SELECT \"x\", \"y\", \"alive\" FROM `cells`;",
      "DROP TABLE `cells`;",
      "ALTER TABLE `__new_cells` RENAME TO `cells`;",
      "PRAGMA foreign_keys=ON;"
    ]
  },
  {
    "version": 7,
    "id": "military_retro_girl",
    "sql": [
      "PRAGMA foreign_keys=OFF;",
      "CREATE TABLE `__new_change_log` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`tbl_name` text NOT NULL,\n\t`op_type` text NOT NULL,\n\t`pk_json` text NOT NULL,\n\t`row_json` text NOT NULL,\n\t`changed_at` text\n);",
      "INSERT INTO `__new_change_log`(\"id\", \"tbl_name\", \"op_type\", \"pk_json\", \"row_json\", \"changed_at\") SELECT \"id\", \"tbl_name\", \"op_type\", \"pk_json\", \"row_json\", \"changed_at\" FROM `change_log`;",
      "DROP TABLE `change_log`;",
      "ALTER TABLE `__new_change_log` RENAME TO `change_log`;",
      "PRAGMA foreign_keys=ON;",
      "CREATE TABLE `__new_migrations` (\n\t`name` text PRIMARY KEY NOT NULL,\n\t`applied_at` text\n);",
      "INSERT INTO `__new_migrations`(\"name\", \"applied_at\") SELECT \"name\", \"applied_at\" FROM `migrations`;",
      "DROP TABLE `migrations`;",
      "ALTER TABLE `__new_migrations` RENAME TO `migrations`;",
      "CREATE TABLE `__new_posts` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`author_id` integer NOT NULL,\n\t`title` text NOT NULL,\n\t`body` text NOT NULL,\n\t`created_at` text,\n\t`updated_at` text,\n\tFOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "INSERT INTO `__new_posts`(\"id\", \"author_id\", \"title\", \"body\", \"created_at\", \"updated_at\") SELECT \"id\", \"author_id\", \"title\", \"body\", \"created_at\", \"updated_at\" FROM `posts`;",
      "DROP TABLE `posts`;",
      "ALTER TABLE `__new_posts` RENAME TO `posts`;",
      "CREATE TABLE `__new_users` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`name` text NOT NULL,\n\t`email` text NOT NULL,\n\t`picture` text,\n\t`bio` text,\n\t`location` text,\n\t`created_at` text,\n\t`is_active` integer DEFAULT true\n);",
      "INSERT INTO `__new_users`(\"id\", \"name\", \"email\", \"picture\", \"bio\", \"location\", \"created_at\", \"is_active\") SELECT \"id\", \"name\", \"email\", \"picture\", \"bio\", \"location\", \"created_at\", \"is_active\" FROM `users`;",
      "DROP TABLE `users`;",
      "ALTER TABLE `__new_users` RENAME TO `users`;",
      "CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);"
    ]
  },
  {
    "version": 8,
    "id": "open_vindicator",
    "sql": [
      "PRAGMA foreign_keys=OFF;",
      "CREATE TABLE `__new_change_log` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`tbl_name` text NOT NULL,\n\t`op_type` text NOT NULL,\n\t`pk_json` text NOT NULL,\n\t`row_json` text NOT NULL,\n\t`changed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL\n);",
      "INSERT INTO `__new_change_log`(\"id\", \"tbl_name\", \"op_type\", \"pk_json\", \"row_json\", \"changed_at\") SELECT \"id\", \"tbl_name\", \"op_type\", \"pk_json\", \"row_json\", \"changed_at\" FROM `change_log`;",
      "DROP TABLE `change_log`;",
      "ALTER TABLE `__new_change_log` RENAME TO `change_log`;",
      "PRAGMA foreign_keys=ON;",
      "CREATE TABLE `__new_migrations` (\n\t`name` text PRIMARY KEY NOT NULL,\n\t`applied_at` text DEFAULT (current_timestamp) NOT NULL\n);",
      "INSERT INTO `__new_migrations`(\"name\", \"applied_at\") SELECT \"name\", \"applied_at\" FROM `migrations`;",
      "DROP TABLE `migrations`;",
      "ALTER TABLE `__new_migrations` RENAME TO `migrations`;",
      "CREATE TABLE `__new_posts` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`author_id` integer NOT NULL,\n\t`title` text NOT NULL,\n\t`body` text NOT NULL,\n\t`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,\n\t`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,\n\tFOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "INSERT INTO `__new_posts`(\"id\", \"author_id\", \"title\", \"body\", \"created_at\", \"updated_at\") SELECT \"id\", \"author_id\", \"title\", \"body\", \"created_at\", \"updated_at\" FROM `posts`;",
      "DROP TABLE `posts`;",
      "ALTER TABLE `__new_posts` RENAME TO `posts`;",
      "CREATE TABLE `__new_users` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`name` text NOT NULL,\n\t`email` text NOT NULL,\n\t`picture` text,\n\t`bio` text,\n\t`location` text,\n\t`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,\n\t`is_active` integer DEFAULT true\n);",
      "INSERT INTO `__new_users`(\"id\", \"name\", \"email\", \"picture\", \"bio\", \"location\", \"created_at\", \"is_active\") SELECT \"id\", \"name\", \"email\", \"picture\", \"bio\", \"location\", \"created_at\", \"is_active\" FROM `users`;",
      "DROP TABLE `users`;",
      "ALTER TABLE `__new_users` RENAME TO `users`;",
      "CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);"
    ]
  }
]
