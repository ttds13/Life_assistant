-- Day 8 order P0 consistency fields.
-- Keep this migration limited to optimistic-locking support, status-log auditability,
-- and indexes required by the first backend order implementation.

ALTER TABLE `orders`
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 0;

CREATE INDEX `orders_user_id_status_idx` ON `orders`(`user_id`, `status`);
CREATE INDEX `orders_staff_id_status_idx` ON `orders`(`staff_id`, `status`);
CREATE INDEX `orders_status_appointment_start_time_idx` ON `orders`(`status`, `appointment_start_time`);

ALTER TABLE `order_status_logs`
  ADD COLUMN `action` VARCHAR(64) NULL,
  ADD COLUMN `request_id` VARCHAR(64) NULL,
  ADD COLUMN `detail` JSON NULL;

CREATE INDEX `order_status_logs_order_id_created_at_idx` ON `order_status_logs`(`order_id`, `created_at`);
CREATE INDEX `order_status_logs_request_id_idx` ON `order_status_logs`(`request_id`);
CREATE INDEX `order_status_logs_action_idx` ON `order_status_logs`(`action`);
