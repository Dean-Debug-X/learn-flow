CREATE TABLE `products` (
  `id` int AUTO_INCREMENT NOT NULL,
  `type` enum('course','vip') NOT NULL DEFAULT 'course',
  `title` varchar(255) NOT NULL,
  `description` text,
  `status` enum('draft','active','archived') NOT NULL DEFAULT 'active',
  `courseId` int,
  `priceCents` int NOT NULL DEFAULT 0,
  `durationDays` int,
  `coverUrl` text,
  `sortOrder` int DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `products_id` PRIMARY KEY(`id`),
  CONSTRAINT `products_course_unique` UNIQUE(`courseId`),
  CONSTRAINT `products_courseId_courses_id_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE `orders` (
  `id` int AUTO_INCREMENT NOT NULL,
  `orderNo` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `productId` int NOT NULL,
  `courseId` int,
  `productSnapshotTitle` varchar(255) NOT NULL,
  `amountCents` int NOT NULL DEFAULT 0,
  `status` enum('pending','paid','cancelled','refunded') NOT NULL DEFAULT 'pending',
  `paymentMethod` enum('mock','manual','wechat','alipay') NOT NULL DEFAULT 'mock',
  `paidAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `orders_id` PRIMARY KEY(`id`),
  CONSTRAINT `orders_orderNo_unique` UNIQUE(`orderNo`),
  CONSTRAINT `orders_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action,
  CONSTRAINT `orders_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action,
  CONSTRAINT `orders_courseId_courses_id_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE `user_subscriptions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `productId` int,
  `orderId` int,
  `planName` varchar(255) NOT NULL,
  `status` enum('active','expired','cancelled') NOT NULL DEFAULT 'active',
  `startAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `endAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `user_subscriptions_id` PRIMARY KEY(`id`),
  CONSTRAINT `user_subscriptions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action,
  CONSTRAINT `user_subscriptions_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action,
  CONSTRAINT `user_subscriptions_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE `user_entitlements` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `entitlementType` enum('course','vip') NOT NULL,
  `courseId` int,
  `sourceType` enum('order','admin','system') NOT NULL DEFAULT 'order',
  `orderId` int,
  `subscriptionId` int,
  `startsAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `endsAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `user_entitlements_id` PRIMARY KEY(`id`),
  CONSTRAINT `user_entitlements_unique` UNIQUE(`userId`,`entitlementType`,`courseId`),
  CONSTRAINT `user_entitlements_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action,
  CONSTRAINT `user_entitlements_courseId_courses_id_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE no action ON UPDATE no action,
  CONSTRAINT `user_entitlements_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action,
  CONSTRAINT `user_entitlements_subscriptionId_user_subscriptions_id_fk` FOREIGN KEY (`subscriptionId`) REFERENCES `user_subscriptions`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
INSERT INTO `products` (`type`, `title`, `description`, `status`, `priceCents`, `durationDays`, `sortOrder`)
VALUES (
  'vip',
  '年度会员',
  '开通后可访问所有会员课程。当前版本为骨架实现，订单支付成功后会立即发放会员权益。',
  'active',
  19900,
  365,
  0
)
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`), `priceCents` = VALUES(`priceCents`), `durationDays` = VALUES(`durationDays`);
--> statement-breakpoint
INSERT INTO `products` (`type`, `title`, `description`, `status`, `courseId`, `priceCents`, `coverUrl`, `sortOrder`)
SELECT 'course', `title`, CONCAT('购买后可获得《', `title`, '》的单课访问权限。'), 'active', `id`, IFNULL(NULLIF(`priceCents`, 0), 9900), `coverUrl`, IFNULL(`featuredOrder`, 0)
FROM `courses`
WHERE `accessType` = 'paid'
ON DUPLICATE KEY UPDATE
  `title` = VALUES(`title`),
  `description` = VALUES(`description`),
  `status` = VALUES(`status`),
  `priceCents` = VALUES(`priceCents`),
  `coverUrl` = VALUES(`coverUrl`),
  `sortOrder` = VALUES(`sortOrder`);
