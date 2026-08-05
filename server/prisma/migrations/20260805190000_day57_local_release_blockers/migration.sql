-- Day57: cumulative, idempotent point refund reversals and database-backed admin roles.

ALTER TABLE `admin_users`
  ADD COLUMN `role_id` BIGINT NULL,
  ADD COLUMN `version` INT NOT NULL DEFAULT 0;

ALTER TABLE `roles`
  ADD COLUMN `status` VARCHAR(16) NOT NULL DEFAULT 'active',
  ADD COLUMN `is_system` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `version` INT NOT NULL DEFAULT 0;

CREATE INDEX `admin_users_role_id_idx` ON `admin_users`(`role_id`);

ALTER TABLE `admin_users`
  ADD CONSTRAINT `admin_users_role_id_fkey`
    FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE SET NULL;

INSERT INTO `roles` (`name`, `display_name`, `permissions`, `status`, `is_system`, `version`, `created_at`, `updated_at`)
VALUES
  ('super_admin', 'Super Admin', JSON_ARRAY('*'), 'active', true, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('operator', 'Operator', JSON_ARRAY(
    'dashboard:view', 'user:list', 'user:detail', 'user:update',
    'user-commerce:list', 'user-commerce:detail',
    'user-order:create', 'user-order:update', 'user-order:cancel',
    'user-booking:create', 'user-booking:update', 'user-booking:reschedule',
    'user-booking:address:update', 'user-booking:assign', 'user-booking:cancel',
    'user-member-card:update', 'user-member-card:suspend',
    'service:list', 'service:create', 'service:update',
    'appointment-lock:list', 'appointment-lock:create', 'appointment-lock:update',
    'order:list', 'order:detail', 'order:update', 'order:assign',
    'staff:list', 'staff:create', 'staff:update', 'staff:audit',
    'point-rule:list', 'referral:list', 'referral:review',
    'member-card:list', 'address:list', 'address:create', 'address:update',
    'review:list', 'review:update', 'audit-center:list', 'audit-center:review',
    'image:list', 'image:detail', 'image:update'
  ), 'active', true, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('finance', 'Finance', JSON_ARRAY(
    'dashboard:view', 'user-commerce:list', 'user-commerce:detail',
    'order:list', 'order:detail', 'finance:summary:view',
    'finance:payment:list', 'finance:refund:list', 'finance:refund:audit',
    'finance:refund:retry', 'finance:point:list', 'finance:point:adjust',
    'point-rule:list', 'referral:list', 'finance:withdraw:list',
    'finance:withdraw:detail', 'finance:withdraw:audit', 'finance:withdraw:execute',
    'finance:withdraw:retry', 'finance:withdraw:reconcile', 'audit-log:list'
  ), 'active', true, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `display_name` = VALUES(`display_name`),
  `permissions` = COALESCE(`permissions`, VALUES(`permissions`)),
  `status` = 'active',
  `is_system` = true;

UPDATE `admin_users` AS admin_user
INNER JOIN `roles` AS role_record ON role_record.`name` = admin_user.`role`
SET admin_user.`role_id` = role_record.`id`
WHERE admin_user.`role_id` IS NULL;

CREATE TABLE `admin_operation_requests` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `admin_id` BIGINT NOT NULL,
  `operation` VARCHAR(64) NOT NULL,
  `idempotency_key` VARCHAR(96) NOT NULL,
  `request_hash` CHAR(64) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'processing',
  `target_type` VARCHAR(48) NULL,
  `target_id` VARCHAR(64) NULL,
  `result` JSON NULL,
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `admin_operation_requests_admin_id_operation_idempotency_key_key`
    (`admin_id`, `operation`, `idempotency_key`),
  INDEX `admin_operation_requests_status_created_at_idx` (`status`, `created_at`),
  INDEX `admin_operation_requests_target_type_target_id_idx` (`target_type`, `target_id`),
  CONSTRAINT `admin_operation_requests_admin_id_fkey`
    FOREIGN KEY (`admin_id`) REFERENCES `admin_users`(`id`) ON DELETE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `user_member_cards`
  ADD COLUMN `version` INT NOT NULL DEFAULT 0;

ALTER TABLE `point_reward_events`
  ADD COLUMN `reversed_base_amount` DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE TABLE `point_reward_reversals` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `reward_event_id` BIGINT NOT NULL,
  `refund_id` BIGINT NOT NULL,
  `refund_amount` DECIMAL(10,2) NOT NULL,
  `reversed_points` INT NOT NULL,
  `event_key` VARCHAR(160) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `point_reward_reversals_event_key_key` (`event_key`),
  UNIQUE INDEX `point_reward_reversals_reward_event_id_refund_id_key` (`reward_event_id`, `refund_id`),
  INDEX `point_reward_reversals_refund_id_idx` (`refund_id`),
  CONSTRAINT `point_reward_reversals_reward_event_id_fkey`
    FOREIGN KEY (`reward_event_id`) REFERENCES `point_reward_events`(`id`) ON DELETE CASCADE,
  CONSTRAINT `point_reward_reversals_refund_id_fkey`
    FOREIGN KEY (`refund_id`) REFERENCES `refunds`(`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
