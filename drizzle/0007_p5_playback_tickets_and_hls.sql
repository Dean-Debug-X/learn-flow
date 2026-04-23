ALTER TABLE `media_assets`
  ADD COLUMN `transcodeStatus` enum('none','queued','processing','ready','failed') NOT NULL DEFAULT 'none',
  ADD COLUMN `transcodeJobId` varchar(128),
  ADD COLUMN `hlsManifestKey` varchar(512),
  ADD COLUMN `hlsManifestUrl` text,
  ADD COLUMN `posterUrl` text;

CREATE UNIQUE INDEX `media_assets_hlsManifestKey_unique` ON `media_assets` (`hlsManifestKey`);
