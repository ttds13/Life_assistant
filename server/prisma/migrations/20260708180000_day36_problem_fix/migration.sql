ALTER TABLE `users`
  ADD COLUMN `source` VARCHAR(16) NULL DEFAULT 'miniapp',
  ADD COLUMN `admin_remark` VARCHAR(512) NULL;

ALTER TABLE `order_assignments`
  ADD COLUMN `notification_id` BIGINT NULL,
  ADD COLUMN `notification_status` VARCHAR(16) NULL;

CREATE TABLE `point_ledgers` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `order_id` BIGINT NULL,
  `type` VARCHAR(24) NOT NULL,
  `points` INTEGER NOT NULL,
  `amount` DECIMAL(10, 2) NULL,
  `balance_after` INTEGER NOT NULL,
  `remark` VARCHAR(256) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `point_ledgers_order_id_type_key`
  ON `point_ledgers`(`order_id`, `type`);
CREATE INDEX `point_ledgers_user_id_created_at_idx`
  ON `point_ledgers`(`user_id`, `created_at`);
CREATE INDEX `point_ledgers_order_id_idx`
  ON `point_ledgers`(`order_id`);

ALTER TABLE `point_ledgers`
  ADD CONSTRAINT `point_ledgers_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `point_ledgers`
  ADD CONSTRAINT `point_ledgers_order_id_fkey`
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
