CREATE TABLE `comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`scanId` int,
	`authorName` varchar(255) NOT NULL,
	`commentType` enum('general','review','validation','question') NOT NULL DEFAULT 'general',
	`content` text NOT NULL,
	`filePath` varchar(500),
	`lineNumber` int,
	`validationStatus` enum('pending','approved','rejected'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `git_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`provider` enum('github','gitlab','bitbucket','azure_devops') NOT NULL,
	`repoUrl` varchar(500) NOT NULL,
	`repoName` varchar(255) NOT NULL,
	`defaultBranch` varchar(255) NOT NULL DEFAULT 'main',
	`isMonorepo` boolean NOT NULL DEFAULT false,
	`detectedModules` json,
	`lastSyncAt` timestamp,
	`connectionStatus` enum('connected','disconnected','error') NOT NULL DEFAULT 'connected',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `git_connections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`filePath` varchar(500) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`lineCount` int NOT NULL DEFAULT 0,
	`technologies` json,
	`moduleName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`status` enum('active','archived','completed') NOT NULL DEFAULT 'active',
	`technologies` json,
	`fileCount` int NOT NULL DEFAULT 0,
	`totalLines` int NOT NULL DEFAULT 0,
	`legacyScore` int,
	`modernScore` int,
	`gitUrl` varchar(500),
	`gitProvider` enum('github','gitlab','bitbucket','azure_devops'),
	`gitBranch` varchar(255),
	`lastAnalyzedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`scanType` enum('full','incremental','quick') NOT NULL DEFAULT 'full',
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`filesAnalyzed` int NOT NULL DEFAULT 0,
	`technologies` json,
	`legacyScore` int,
	`modernScore` int,
	`issuesCount` int NOT NULL DEFAULT 0,
	`criticalCount` int NOT NULL DEFAULT 0,
	`warningCount` int NOT NULL DEFAULT 0,
	`durationMs` int,
	`analysisResult` json,
	`microservicesResult` json,
	`cloudResult` json,
	`aiResult` json,
	`migrationPlan` json,
	`architectureGraph` json,
	`errorMessage` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shared_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`scanId` int,
	`shareToken` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`expiresAt` timestamp,
	`viewCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shared_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `shared_reports_shareToken_unique` UNIQUE(`shareToken`)
);
