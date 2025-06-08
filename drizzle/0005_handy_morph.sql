CREATE TABLE `cells` (
	`x` integer,
	`y` integer,
	`alive` integer DEFAULT false,
	PRIMARY KEY(`x`, `y`)
);
