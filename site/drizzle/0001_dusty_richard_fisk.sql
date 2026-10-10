CREATE TABLE `pdf_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`size` integer NOT NULL,
	`creator_hash` text NOT NULL,
	`upload_hash` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`upload_expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_pdf_shares_creator_status` ON `pdf_shares` (`creator_hash`,`status`);--> statement-breakpoint
CREATE INDEX `idx_pdf_shares_status_expiry` ON `pdf_shares` (`status`,`upload_expires`);--> statement-breakpoint
CREATE TABLE `share_events` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_share_events_created` ON `share_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_share_events_creator_created` ON `share_events` (`creator_hash`,`created_at`);