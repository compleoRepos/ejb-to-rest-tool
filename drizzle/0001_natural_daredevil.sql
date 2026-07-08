CREATE TABLE `ejb_endpoints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`className` varchar(255) NOT NULL,
	`ejbType` varchar(50) NOT NULL,
	`methodName` varchar(255) NOT NULL,
	`httpMethod` varchar(10) NOT NULL,
	`restPath` varchar(500),
	`inputFields` json,
	`outputFields` json,
	`methodBody` text,
	`bianServiceDomain` varchar(255),
	`bianActionTerm` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ejb_endpoints_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `generations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`mode` enum('adapter','bian') NOT NULL,
	`status` enum('pending','generating','completed','error') NOT NULL DEFAULT 'pending',
	`zipStorageKey` varchar(500),
	`zipUrl` text,
	`stats` json,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `generations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`originalFileName` varchar(500),
	`status` enum('uploaded','parsed','error') NOT NULL DEFAULT 'uploaded',
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
