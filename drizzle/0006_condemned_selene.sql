PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_cells` (
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`alive` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`x`, `y`)
);
--> statement-breakpoint
INSERT INTO `__new_cells`("x", "y", "alive") SELECT "x", "y", "alive" FROM `cells`;--> statement-breakpoint
DROP TABLE `cells`;--> statement-breakpoint
ALTER TABLE `__new_cells` RENAME TO `cells`;--> statement-breakpoint
PRAGMA foreign_keys=ON;