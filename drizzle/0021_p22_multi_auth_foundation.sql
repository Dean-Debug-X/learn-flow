ALTER TABLE `users`
  ADD COLUMN `avatarUrl` text,
  ADD COLUMN `phone` varchar(32),
  ADD COLUMN `emailVerifiedAt` timestamp NULL,
  ADD COLUMN `phoneVerifiedAt` timestamp NULL,
  ADD COLUMN `status` enum('active','disabled') NOT NULL DEFAULT 'active',
  ADD COLUMN `sessionVersion` int NOT NULL DEFAULT 0;

CREATE TABLE `user_identities` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `provider` varchar(64) NOT NULL,
  `providerUserId` varchar(191) NOT NULL,
  `providerUnionId` varchar(191),
  `displayName` varchar(255),
  `avatarUrl` text,
  `email` varchar(320),
  `phone` varchar(32),
  `verifiedAt` timestamp NULL,
  `lastUsedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `metadata` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `user_identities_id` PRIMARY KEY(`id`),
  CONSTRAINT `user_identities_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `user_identities_provider_user_unique` UNIQUE(`provider`,`providerUserId`)
);

CREATE INDEX `user_identities_user_provider_idx` ON `user_identities` (`userId`,`provider`);
CREATE INDEX `user_identities_provider_union_idx` ON `user_identities` (`providerUnionId`);

INSERT IGNORE INTO `user_identities` (
  `userId`,
  `provider`,
  `providerUserId`,
  `displayName`,
  `email`,
  `verifiedAt`,
  `lastUsedAt`,
  `createdAt`,
  `updatedAt`
)
SELECT
  `id`,
  'manus_oauth_legacy',
  `openId`,
  NULLIF(`name`, ''),
  `email`,
  `lastSignedIn`,
  `lastSignedIn`,
  `createdAt`,
  `updatedAt`
FROM `users`
WHERE `openId` IS NOT NULL AND `openId` <> '';

CREATE TABLE `auth_otps` (
  `id` int AUTO_INCREMENT NOT NULL,
  `channel` enum('sms','email') NOT NULL,
  `purpose` varchar(64) NOT NULL,
  `target` varchar(191) NOT NULL,
  `codeHash` varchar(255) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `consumedAt` timestamp NULL,
  `attemptCount` int NOT NULL DEFAULT 0,
  `maxAttempts` int NOT NULL DEFAULT 5,
  `requestIp` varchar(128),
  `userAgent` varchar(512),
  `providerRequestId` varchar(191),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `auth_otps_id` PRIMARY KEY(`id`)
);

CREATE INDEX `auth_otps_target_lookup_idx` ON `auth_otps` (`channel`,`target`,`purpose`,`createdAt`);
CREATE INDEX `auth_otps_expires_at_idx` ON `auth_otps` (`expiresAt`);

CREATE TABLE `auth_audit_logs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int,
  `identityId` int,
  `eventType` varchar(64) NOT NULL,
  `channel` varchar(32),
  `target` varchar(191),
  `ipAddress` varchar(128),
  `userAgent` varchar(512),
  `success` boolean NOT NULL DEFAULT true,
  `errorCode` varchar(64),
  `errorMessage` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `auth_audit_logs_id` PRIMARY KEY(`id`),
  CONSTRAINT `auth_audit_logs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `auth_audit_logs_identityId_user_identities_id_fk` FOREIGN KEY (`identityId`) REFERENCES `user_identities`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX `auth_audit_logs_user_created_idx` ON `auth_audit_logs` (`userId`,`createdAt`);
CREATE INDEX `auth_audit_logs_event_created_idx` ON `auth_audit_logs` (`eventType`,`createdAt`);
