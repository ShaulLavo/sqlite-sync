PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_change_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tbl_name` text NOT NULL,
	`op_type` text NOT NULL,
	`pk_json` text NOT NULL,
	`row_json` text NOT NULL,
	`changed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_change_log`("id", "tbl_name", "op_type", "pk_json", "row_json", "changed_at") SELECT "id", "tbl_name", "op_type", "pk_json", "row_json", "changed_at" FROM `change_log`;--> statement-breakpoint
DROP TABLE `change_log`;--> statement-breakpoint
ALTER TABLE `__new_change_log` RENAME TO `change_log`;--> statement-breakpoint
PRAGMA foreign_keys=ON;