PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_change_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tbl_name` text NOT NULL,
	`op_type` text NOT NULL,
	`pk_json` text NOT NULL,
	`row_json` text NOT NULL,
	`changed_at` text
);
--> statement-breakpoint
INSERT INTO `__new_change_log`("id", "tbl_name", "op_type", "pk_json", "row_json", "changed_at") SELECT "id", "tbl_name", "op_type", "pk_json", "row_json", "changed_at" FROM `change_log`;--> statement-breakpoint
DROP TABLE `change_log`;--> statement-breakpoint
ALTER TABLE `__new_change_log` RENAME TO `change_log`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_migrations` (
	`name` text PRIMARY KEY NOT NULL,
	`applied_at` text
);
--> statement-breakpoint
INSERT INTO `__new_migrations`("name", "applied_at") SELECT "name", "applied_at" FROM `migrations`;--> statement-breakpoint
DROP TABLE `migrations`;--> statement-breakpoint
ALTER TABLE `__new_migrations` RENAME TO `migrations`;--> statement-breakpoint
CREATE TABLE `__new_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`author_id` integer NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text,
	`updated_at` text,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_posts`("id", "author_id", "title", "body", "created_at", "updated_at") SELECT "id", "author_id", "title", "body", "created_at", "updated_at" FROM `posts`;--> statement-breakpoint
DROP TABLE `posts`;--> statement-breakpoint
ALTER TABLE `__new_posts` RENAME TO `posts`;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`picture` text,
	`bio` text,
	`location` text,
	`created_at` text,
	`is_active` integer DEFAULT true
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "name", "email", "picture", "bio", "location", "created_at", "is_active") SELECT "id", "name", "email", "picture", "bio", "location", "created_at", "is_active" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);