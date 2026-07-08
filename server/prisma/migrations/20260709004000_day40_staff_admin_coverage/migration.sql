ALTER TABLE `notifications`
  ADD COLUMN `sent_at` DATETIME(3) NULL,
  ADD COLUMN `read_at` DATETIME(3) NULL,
  ADD COLUMN `retry_count` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `last_retried_at` DATETIME(3) NULL,
  ADD COLUMN `failure_reason` VARCHAR(512) NULL,
  ADD COLUMN `created_by_type` VARCHAR(16) NULL,
  ADD COLUMN `created_by_id` BIGINT NULL,
  ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

UPDATE `notifications`
SET `sent_at` = `created_at`, `send_status` = 'sent'
WHERE `sent_at` IS NULL AND `send_status` IN ('created', 'sent');

CREATE INDEX `notifications_receiver_type_receiver_id_created_at_idx`
  ON `notifications`(`receiver_type`, `receiver_id`, `created_at`);
CREATE INDEX `notifications_biz_type_biz_id_idx`
  ON `notifications`(`biz_type`, `biz_id`);
CREATE INDEX `notifications_send_status_idx`
  ON `notifications`(`send_status`);

CREATE TABLE `staff_profile_change_requests` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `request_no` VARCHAR(32) NOT NULL,
  `staff_id` BIGINT NOT NULL,
  `user_id` BIGINT NULL,
  `change_type` VARCHAR(32) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
  `before_snapshot` JSON NOT NULL,
  `after_snapshot` JSON NOT NULL,
  `changed_fields` JSON NULL,
  `submit_note` TEXT NULL,
  `reject_reason` TEXT NULL,
  `submitted_by` BIGINT NULL,
  `reviewed_by` BIGINT NULL,
  `reviewed_at` DATETIME(3) NULL,
  `applied_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `staff_profile_change_requests_request_no_key`
  ON `staff_profile_change_requests`(`request_no`);
CREATE INDEX `staff_profile_change_requests_staff_id_status_idx`
  ON `staff_profile_change_requests`(`staff_id`, `status`);
CREATE INDEX `staff_profile_change_requests_status_created_at_idx`
  ON `staff_profile_change_requests`(`status`, `created_at`);
CREATE INDEX `staff_profile_change_requests_user_id_idx`
  ON `staff_profile_change_requests`(`user_id`);

ALTER TABLE `staff_profile_change_requests`
  ADD CONSTRAINT `staff_profile_change_requests_staff_id_fkey`
  FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
