ALTER TABLE `payments`
  ADD COLUMN `refunded_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE `refunds`
  ADD COLUMN `channel` VARCHAR(16) NULL,
  ADD COLUMN `out_refund_no` VARCHAR(64) NULL,
  ADD COLUMN `failure_reason` VARCHAR(512) NULL,
  ADD COLUMN `notify_raw` TEXT NULL,
  ADD COLUMN `retry_count` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `reviewed_by` BIGINT NULL,
  ADD COLUMN `reviewed_at` DATETIME(3) NULL,
  ADD COLUMN `processed_at` DATETIME(3) NULL;

UPDATE `refunds` r
JOIN `payments` p ON p.`id` = r.`payment_id`
SET r.`channel` = p.`channel`,
    r.`out_refund_no` = r.`refund_no`
WHERE r.`channel` IS NULL
   OR r.`out_refund_no` IS NULL;

CREATE INDEX `refunds_payment_id_idx` ON `refunds`(`payment_id`);
CREATE INDEX `refunds_status_idx` ON `refunds`(`status`);
CREATE INDEX `refunds_channel_refund_no_idx` ON `refunds`(`channel_refund_no`);

ALTER TABLE `refunds`
  ADD CONSTRAINT `refunds_order_id_fkey`
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
