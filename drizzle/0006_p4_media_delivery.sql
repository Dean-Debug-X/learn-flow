ALTER TABLE `media_assets`
  ADD COLUMN `accessLevel` enum('public','protected') NOT NULL DEFAULT 'public';
