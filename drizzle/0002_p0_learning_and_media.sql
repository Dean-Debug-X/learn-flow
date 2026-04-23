CREATE TABLE `media_assets` (
  `id` int AUTO_INCREMENT NOT NULL,
  `type` enum('image','video','file') NOT NULL DEFAULT 'file',
  `originName` varchar(255) NOT NULL,
  `storageKey` varchar(512),
  `url` text NOT NULL,
  `mimeType` varchar(255),
  `size` int DEFAULT 0,
  `duration` int DEFAULT 0,
  `source` enum('local','storage','remote') NOT NULL DEFAULT 'local',
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `media_assets_id` PRIMARY KEY(`id`),
  CONSTRAINT `media_assets_storageKey_unique` UNIQUE(`storageKey`)
);
--> statement-breakpoint
CREATE TABLE `user_course_progress` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `courseId` int NOT NULL,
  `progressPercent` int DEFAULT 0,
  `lastChapterId` int,
  `lastPositionSeconds` int DEFAULT 0,
  `completedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `user_course_progress_id` PRIMARY KEY(`id`),
  CONSTRAINT `user_course_progress_user_course_unique` UNIQUE(`userId`,`courseId`)
);
--> statement-breakpoint
CREATE TABLE `user_chapter_progress` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `chapterId` int NOT NULL,
  `watchedSeconds` int DEFAULT 0,
  `completed` boolean DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `user_chapter_progress_id` PRIMARY KEY(`id`),
  CONSTRAINT `user_chapter_progress_user_chapter_unique` UNIQUE(`userId`,`chapterId`)
);
--> statement-breakpoint
CREATE TABLE `user_learning_history` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `courseId` int NOT NULL,
  `chapterId` int,
  `viewedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `user_learning_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `user_course_progress` ADD CONSTRAINT `user_course_progress_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `user_course_progress` ADD CONSTRAINT `user_course_progress_courseId_courses_id_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `user_course_progress` ADD CONSTRAINT `user_course_progress_lastChapterId_chapters_id_fk` FOREIGN KEY (`lastChapterId`) REFERENCES `chapters`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `user_chapter_progress` ADD CONSTRAINT `user_chapter_progress_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `user_chapter_progress` ADD CONSTRAINT `user_chapter_progress_chapterId_chapters_id_fk` FOREIGN KEY (`chapterId`) REFERENCES `chapters`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `user_learning_history` ADD CONSTRAINT `user_learning_history_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `user_learning_history` ADD CONSTRAINT `user_learning_history_courseId_courses_id_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `user_learning_history` ADD CONSTRAINT `user_learning_history_chapterId_chapters_id_fk` FOREIGN KEY (`chapterId`) REFERENCES `chapters`(`id`) ON DELETE no action ON UPDATE no action;
