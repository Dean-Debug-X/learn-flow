ALTER TABLE `orders`
  ADD COLUMN `refundedAt` timestamp NULL,
  ADD COLUMN `refundAmountCents` int NOT NULL DEFAULT 0,
  ADD COLUMN `refundReason` text,
  ADD COLUMN `benefitsRevokedAt` timestamp NULL,
  ADD COLUMN `benefitsRevokeCount` int NOT NULL DEFAULT 0,
  ADD COLUMN `lastBenefitRevokeAt` timestamp NULL;
--> statement-breakpoint
CREATE TABLE `payment_notifications` (
  `id` int AUTO_INCREMENT NOT NULL,
  `eventKey` varchar(191) NOT NULL,
  `eventType` enum('payment_paid','payment_failed','payment_cancelled','payment_refunded','benefits_repaired','benefits_revoked') NOT NULL,
  `channel` enum('log','owner','webhook') NOT NULL DEFAULT 'log',
  `relatedOrderId` int,
  `title` varchar(255) NOT NULL,
  `content` text NOT NULL,
  `recipient` varchar(255),
  `payload` text,
  `status` enum('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
  `attempts` int NOT NULL DEFAULT 0,
  `lastAttemptAt` timestamp NULL,
  `sentAt` timestamp NULL,
  `lastError` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `payment_notifications_id` PRIMARY KEY(`id`),
  CONSTRAINT `payment_notifications_relatedOrderId_orders_id_fk` FOREIGN KEY (`relatedOrderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action,
  CONSTRAINT `payment_notifications_eventKey_unique` UNIQUE(`eventKey`)
);
