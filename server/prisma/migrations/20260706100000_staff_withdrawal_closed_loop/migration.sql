ALTER TABLE `staff_income_records`
  MODIFY `type` VARCHAR(32) NOT NULL,
  MODIFY `status` VARCHAR(32) NOT NULL,
  ADD COLUMN `withdraw_request_id` BIGINT NULL,
  ADD COLUMN `settlement_status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  ADD COLUMN `withdraw_status` VARCHAR(32) NOT NULL DEFAULT 'none',
  ADD COLUMN `available_at` DATETIME(3) NULL;

ALTER TABLE `withdraw_requests`
  MODIFY `status` VARCHAR(32) NOT NULL,
  ADD COLUMN `withdraw_no` VARCHAR(64) NULL,
  ADD COLUMN `amount_fen` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `fee_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `available_snapshot` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `channel` VARCHAR(16) NOT NULL DEFAULT 'mock',
  ADD COLUMN `out_bill_no` VARCHAR(64) NULL,
  ADD COLUMN `transfer_bill_no` VARCHAR(128) NULL,
  ADD COLUMN `package_info` TEXT NULL,
  ADD COLUMN `openid` VARCHAR(64) NULL,
  ADD COLUMN `user_name_encrypted` VARCHAR(512) NULL,
  ADD COLUMN `failure_reason` VARCHAR(512) NULL,
  ADD COLUMN `reject_reason` VARCHAR(512) NULL,
  ADD COLUMN `notify_raw` TEXT NULL,
  ADD COLUMN `retry_count` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `request_id` VARCHAR(64) NULL,
  ADD COLUMN `reviewed_by` BIGINT NULL,
  ADD COLUMN `reviewed_at` DATETIME(3) NULL,
  ADD COLUMN `processed_at` DATETIME(3) NULL,
  ADD COLUMN `paid_at` DATETIME(3) NULL,
  ADD COLUMN `expired_at` DATETIME(3) NULL;

UPDATE `withdraw_requests`
SET `withdraw_no` = CONCAT('WD', DATE_FORMAT(`created_at`, '%Y%m%d'), LPAD(`id`, 10, '0')),
    `out_bill_no` = CONCAT('WD', DATE_FORMAT(`created_at`, '%Y%m%d'), LPAD(`id`, 10, '0')),
    `amount_fen` = CAST(ROUND(`amount` * 100) AS SIGNED),
    `available_snapshot` = `amount`,
    `reviewed_by` = `handled_by`,
    `reviewed_at` = `handled_at`
WHERE `withdraw_no` IS NULL;

ALTER TABLE `withdraw_requests`
  MODIFY `withdraw_no` VARCHAR(64) NOT NULL;

CREATE TABLE `withdraw_status_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `withdraw_request_id` BIGINT NOT NULL,
  `from_status` VARCHAR(32) NULL,
  `to_status` VARCHAR(32) NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `operator_type` VARCHAR(16) NOT NULL,
  `operator_id` BIGINT NOT NULL,
  `remark` VARCHAR(512) NULL,
  `detail` JSON NULL,
  `request_id` VARCHAR(64) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `staff_income_records_staff_id_order_id_type_key`
  ON `staff_income_records`(`staff_id`, `order_id`, `type`);
CREATE INDEX `staff_income_records_withdraw_request_id_idx`
  ON `staff_income_records`(`withdraw_request_id`);
CREATE INDEX `staff_income_records_settlement_status_withdraw_status_idx`
  ON `staff_income_records`(`settlement_status`, `withdraw_status`);
CREATE INDEX `staff_income_records_available_at_idx`
  ON `staff_income_records`(`available_at`);

CREATE UNIQUE INDEX `withdraw_requests_withdraw_no_key`
  ON `withdraw_requests`(`withdraw_no`);
CREATE UNIQUE INDEX `withdraw_requests_out_bill_no_key`
  ON `withdraw_requests`(`out_bill_no`);
CREATE INDEX `withdraw_requests_status_idx`
  ON `withdraw_requests`(`status`);
CREATE INDEX `withdraw_requests_channel_idx`
  ON `withdraw_requests`(`channel`);
CREATE INDEX `withdraw_requests_transfer_bill_no_idx`
  ON `withdraw_requests`(`transfer_bill_no`);
CREATE INDEX `withdraw_requests_created_at_idx`
  ON `withdraw_requests`(`created_at`);

CREATE INDEX `withdraw_status_logs_withdraw_request_id_idx`
  ON `withdraw_status_logs`(`withdraw_request_id`);
CREATE INDEX `withdraw_status_logs_action_idx`
  ON `withdraw_status_logs`(`action`);
CREATE INDEX `withdraw_status_logs_created_at_idx`
  ON `withdraw_status_logs`(`created_at`);

ALTER TABLE `withdraw_requests`
  ADD CONSTRAINT `withdraw_requests_staff_id_fkey`
  FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `staff_income_records`
  ADD CONSTRAINT `staff_income_records_withdraw_request_id_fkey`
  FOREIGN KEY (`withdraw_request_id`) REFERENCES `withdraw_requests`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `withdraw_status_logs`
  ADD CONSTRAINT `withdraw_status_logs_withdraw_request_id_fkey`
  FOREIGN KEY (`withdraw_request_id`) REFERENCES `withdraw_requests`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
