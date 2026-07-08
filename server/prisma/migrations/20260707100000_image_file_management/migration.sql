ALTER TABLE `files`
  ADD COLUMN `status` VARCHAR(16) NOT NULL DEFAULT 'active',
  ADD COLUMN `source` VARCHAR(32) NULL,
  ADD COLUMN `visibility` VARCHAR(16) NOT NULL DEFAULT 'private',
  ADD COLUMN `alt` VARCHAR(128) NULL,
  ADD COLUMN `remark` VARCHAR(512) NULL,
  ADD COLUMN `deleted_by` BIGINT NULL,
  ADD COLUMN `deleted_at` DATETIME NULL,
  ADD COLUMN `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

CREATE INDEX `files_status_created_at_idx` ON `files` (`status`, `created_at`);
CREATE INDEX `files_uploader_type_uploader_id_idx` ON `files` (`uploader_type`, `uploader_id`);
CREATE INDEX `files_url_idx` ON `files` (`url`);
