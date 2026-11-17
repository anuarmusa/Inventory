CREATE TABLE `server_rows` (
	`table_name` text NOT NULL,
	`row_key` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`table_name`, `row_key`)
);
--> statement-breakpoint
CREATE TABLE `unsent_actions` (
	`position` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`action` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unsent_actions_id_unique` ON `unsent_actions` (`id`);