CREATE TABLE `change_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tbl_name` text NOT NULL,
	`op_type` text NOT NULL,
	`pk_json` text NOT NULL,
	`changed_at` text DEFAULT (current_timestamp) NOT NULL
);
