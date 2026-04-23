ALTER TABLE `user_notifications` MODIFY COLUMN `eventType` enum('payment_paid','payment_failed','payment_cancelled','payment_refunded','benefits_repaired','benefits_revoked','admin_audit_alert') NOT NULL;
--> statement-breakpoint
ALTER TABLE `email_deliveries` MODIFY COLUMN `eventType` enum('payment_paid','payment_failed','payment_cancelled','payment_refunded','benefits_repaired','benefits_revoked','admin_audit_alert','system_test') NOT NULL;
--> statement-breakpoint
CREATE TABLE `admin_alert_notifications` (
  `id` int AUTO_INCREMENT NOT NULL,
  `eventKey` varchar(191) NOT NULL,
  `auditLogId` int NOT NULL,
  `actionType` varchar(96) NOT NULL,
  `severity` enum('warn','critical') NOT NULL DEFAULT 'warn',
  `channel` enum('log','inbox','email','webhook') NOT NULL DEFAULT 'log',
  `targetUserId` int,
  `relatedOrderId` int,
  `title` varchar(255) NOT NULL,
  `content` text NOT NULL,
  `actionUrl` varchar(512),
  `recipient` varchar(320),
  `payload` text,
  `status` enum('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
  `attempts` int NOT NULL DEFAULT 0,
  `lastAttemptAt` timestamp NULL,
  `sentAt` timestamp NULL,
  `lastError` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `admin_alert_notifications_id` PRIMARY KEY(`id`),
  CONSTRAINT `admin_alert_notifications_eventKey_unique` UNIQUE(`eventKey`),
  CONSTRAINT `admin_alert_notifications_auditLogId_admin_action_audit_logs_id_fk` FOREIGN KEY (`auditLogId`) REFERENCES `admin_action_audit_logs`(`id`) ON DELETE no action ON UPDATE no action,
  CONSTRAINT `admin_alert_notifications_targetUserId_users_id_fk` FOREIGN KEY (`targetUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action,
  CONSTRAINT `admin_alert_notifications_relatedOrderId_orders_id_fk` FOREIGN KEY (`relatedOrderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action
);
