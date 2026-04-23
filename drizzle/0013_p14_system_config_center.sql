CREATE TABLE `system_settings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `settingKey` varchar(120) NOT NULL,
  `value` text,
  `updatedBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `system_settings_id` PRIMARY KEY(`id`),
  CONSTRAINT `system_settings_key_unique` UNIQUE(`settingKey`)
);
--> statement-breakpoint
ALTER TABLE `system_settings` ADD CONSTRAINT `system_settings_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;

--> statement-breakpoint
ALTER TABLE `email_deliveries` MODIFY COLUMN `eventType` enum('payment_paid','payment_failed','payment_cancelled','payment_refunded','benefits_repaired','benefits_revoked','system_test') NOT NULL;
--> statement-breakpoint
ALTER TABLE `email_deliveries` MODIFY COLUMN `provider` enum('log','webhook','resend') NOT NULL DEFAULT 'log';
