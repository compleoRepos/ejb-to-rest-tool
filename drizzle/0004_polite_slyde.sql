CREATE TABLE `cross_module_links` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`source_session_id` varchar(36) NOT NULL,
	`source_class` varchar(255) NOT NULL,
	`target_session_id` varchar(36),
	`target_class` varchar(255) NOT NULL,
	`jndi_path` text,
	`status` enum('UNRESOLVED','RESOLVED','NEWLY_RESOLVED','STUB') NOT NULL DEFAULT 'UNRESOLVED',
	`resolved_at` timestamp,
	CONSTRAINT `cross_module_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspace_sessions` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`session_id` varchar(36) NOT NULL,
	`project_name` varchar(255),
	`artifact_id` varchar(255),
	`added_at` timestamp NOT NULL DEFAULT (now()),
	`analysis_status` enum('PENDING','ANALYZED','LINKED') NOT NULL DEFAULT 'PENDING',
	CONSTRAINT `workspace_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspaces_id` PRIMARY KEY(`id`)
);
