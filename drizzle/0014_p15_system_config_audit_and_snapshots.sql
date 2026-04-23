CREATE TABLE `system_config_snapshots` (
  `id` int AUTO_INCREMENT NOT NULL,
  `snapshotType` enum('export','import','restore') NOT NULL DEFAULT 'export',
  `strategy` enum('merge','replace') NOT NULL DEFAULT 'merge',
  `name` varchar(191) NOT NULL,
  `description` text,
  `itemCount` int NOT NULL DEFAULT 0,
  `checksum` varchar(64),
  `payload` text NOT NULL,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `system_config_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `system_config_snapshots` ADD CONSTRAINT `system_config_snapshots_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE `system_setting_audit_logs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `settingKey` varchar(120),
  `action` enum('set','clear','import','restore','export') NOT NULL DEFAULT 'set',
  `changeSource` enum('admin_ui','snapshot_import','snapshot_restore','snapshot_export') NOT NULL DEFAULT 'admin_ui',
  `snapshotId` int,
  `isSecret` boolean NOT NULL DEFAULT false,
  `previousValuePreview` text,
  `nextValuePreview` text,
  `previousValueHash` varchar(64),
  `nextValueHash` varchar(64),
  `metadata` text,
  `updatedBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `system_setting_audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `system_setting_audit_logs` ADD CONSTRAINT `system_setting_audit_logs_snapshotId_system_config_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `system_config_snapshots`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `system_setting_audit_logs` ADD CONSTRAINT `system_setting_audit_logs_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
