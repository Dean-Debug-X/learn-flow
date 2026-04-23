ALTER TABLE `comments`
  ADD COLUMN `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending' AFTER `parentId`;

UPDATE `comments` SET `status` = 'approved' WHERE `status` IS NULL OR `status` = 'pending';

CREATE TABLE `user_favorites` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `courseId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `user_favorites_id` PRIMARY KEY(`id`),
  CONSTRAINT `user_favorites_user_course_unique` UNIQUE(`userId`,`courseId`),
  CONSTRAINT `user_favorites_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action,
  CONSTRAINT `user_favorites_courseId_courses_id_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE no action ON UPDATE no action
);
