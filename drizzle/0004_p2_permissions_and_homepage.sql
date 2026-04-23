ALTER TABLE `courses`
  ADD COLUMN `accessType` enum('free','login','vip','paid') NOT NULL DEFAULT 'free' AFTER `status`,
  ADD COLUMN `trialChapterCount` int DEFAULT 1 AFTER `accessType`,
  ADD COLUMN `priceCents` int DEFAULT 0 AFTER `trialChapterCount`,
  ADD COLUMN `featuredOrder` int DEFAULT 0 AFTER `featured`,
  ADD COLUMN `publishedAt` timestamp NULL AFTER `tags`;
--> statement-breakpoint
UPDATE `courses`
SET `publishedAt` = COALESCE(`publishedAt`, `createdAt`)
WHERE `status` = 'published';
--> statement-breakpoint
CREATE TABLE `site_settings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `settingKey` varchar(120) NOT NULL,
  `value` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `site_settings_id` PRIMARY KEY(`id`),
  CONSTRAINT `site_settings_key_unique` UNIQUE(`settingKey`)
);
--> statement-breakpoint
CREATE TABLE `homepage_banners` (
  `id` int AUTO_INCREMENT NOT NULL,
  `title` varchar(255) NOT NULL,
  `subtitle` text,
  `imageUrl` text,
  `ctaText` varchar(120),
  `ctaLink` varchar(255),
  `isActive` boolean DEFAULT true,
  `sortOrder` int DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `homepage_banners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
INSERT INTO `site_settings` (`settingKey`, `value`)
VALUES (
  'homepage',
  '{"heroBadge":"AI 驱动的学习平台","heroTitle":"优雅学习，持续成长","heroSubtitle":"把课程内容、学习路径和站点运营配置都收进一个后台里。","primaryButtonText":"浏览课程","secondaryButtonText":"AI 智能搜索","featuredTitle":"优先看看这些精选课程","featuredSubtitle":"后台标记为推荐且已发布的课程会优先展示在这里。"}'
)
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);
