ALTER TABLE `cross_module_links` MODIFY COLUMN `source_session_id` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `cross_module_links` MODIFY COLUMN `target_session_id` varchar(128);--> statement-breakpoint
ALTER TABLE `workspace_sessions` MODIFY COLUMN `session_id` varchar(128) NOT NULL;