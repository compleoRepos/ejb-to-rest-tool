ALTER TABLE `projects` ADD `stars` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `projects` ADD `forks` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `projects` ADD `openIssues` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `projects` ADD `watchers` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `projects` ADD `size` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `projects` ADD `primaryLanguage` varchar(100);--> statement-breakpoint
ALTER TABLE `projects` ADD `topics` json;--> statement-breakpoint
ALTER TABLE `projects` ADD `license` varchar(100);--> statement-breakpoint
ALTER TABLE `projects` ADD `owner` varchar(255);--> statement-breakpoint
ALTER TABLE `projects` ADD `fullName` varchar(500);--> statement-breakpoint
ALTER TABLE `projects` ADD `defaultBranch` varchar(100);--> statement-breakpoint
ALTER TABLE `projects` ADD `isArchived` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `projects` ADD `isFork` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `projects` ADD `lastPushAt` timestamp;--> statement-breakpoint
ALTER TABLE `projects` ADD `githubCreatedAt` timestamp;