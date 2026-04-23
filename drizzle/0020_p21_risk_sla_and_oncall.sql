ALTER TABLE `admin_risk_incidents`
  ADD COLUMN `slaStatus` enum('on_track','due_soon','breached','resolved') NOT NULL DEFAULT 'on_track' AFTER `escalationLevel`,
  ADD COLUMN `ownerUserId` int AFTER `lastEscalatedAt`,
  ADD COLUMN `ownerAssignedAt` timestamp NULL AFTER `ownerUserId`,
  ADD COLUMN `ackDueAt` timestamp NULL AFTER `ownerAssignedAt`,
  ADD COLUMN `resolveDueAt` timestamp NULL AFTER `ackDueAt`;
--> statement-breakpoint
ALTER TABLE `admin_risk_incidents`
  ADD CONSTRAINT `admin_risk_incidents_ownerUserId_users_id_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE `admin_risk_sla_policies` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(128) NOT NULL,
  `triggerSeverity` enum('all','warn','critical') NOT NULL DEFAULT 'all',
  `actionType` varchar(96),
  `resourceType` varchar(64),
  `acknowledgeMinutes` int NOT NULL DEFAULT 15,
  `resolveMinutes` int NOT NULL DEFAULT 120,
  `enabled` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `admin_risk_sla_policies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `admin_risk_oncall_assignments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(128) NOT NULL,
  `userId` int NOT NULL,
  `triggerSeverity` enum('all','warn','critical') NOT NULL DEFAULT 'all',
  `actionType` varchar(96),
  `resourceType` varchar(64),
  `isPrimary` boolean NOT NULL DEFAULT false,
  `enabled` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `admin_risk_oncall_assignments_id` PRIMARY KEY(`id`),
  CONSTRAINT `admin_risk_oncall_assignments_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);
