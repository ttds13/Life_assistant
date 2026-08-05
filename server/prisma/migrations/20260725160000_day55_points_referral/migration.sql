-- Day55: versioned point rewards, referral attribution, and idempotent reward events.

CREATE TABLE `point_reward_rules` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `trigger` VARCHAR(32) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'active',
  `current_version` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `point_reward_rules_code_key` (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `point_reward_rule_versions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `rule_id` BIGINT NOT NULL,
  `version` INT NOT NULL,
  `calculation_type` VARCHAR(48) NOT NULL,
  `qualification_config` JSON NULL,
  `calculation_config` JSON NULL,
  `earn_points_per_yuan` INT NOT NULL DEFAULT 10,
  `redemption_points_per_yuan` INT NOT NULL DEFAULT 200,
  `effective_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `published_by` BIGINT NULL,
  `snapshot` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `point_reward_rule_versions_rule_id_version_key` (`rule_id`, `version`),
  INDEX `point_reward_rule_versions_rule_id_effective_at_idx` (`rule_id`, `effective_at`),
  CONSTRAINT `point_reward_rule_versions_rule_id_fkey`
    FOREIGN KEY (`rule_id`) REFERENCES `point_reward_rules`(`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `referral_invite_codes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `code` VARCHAR(24) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'active',
  `rotated_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `referral_invite_codes_user_id_key` (`user_id`),
  UNIQUE INDEX `referral_invite_codes_code_key` (`code`),
  CONSTRAINT `referral_invite_codes_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `referral_invites` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `token` VARCHAR(96) NOT NULL,
  `inviter_user_id` BIGINT NOT NULL,
  `invite_code_id` BIGINT NULL,
  `channel` VARCHAR(16) NOT NULL DEFAULT 'link',
  `status` VARCHAR(16) NOT NULL DEFAULT 'active',
  `expires_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `referral_invites_token_key` (`token`),
  INDEX `referral_invites_inviter_user_id_status_idx` (`inviter_user_id`, `status`),
  INDEX `referral_invites_expires_at_idx` (`expires_at`),
  CONSTRAINT `referral_invites_inviter_user_id_fkey`
    FOREIGN KEY (`inviter_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `referral_invites_invite_code_id_fkey`
    FOREIGN KEY (`invite_code_id`) REFERENCES `referral_invite_codes`(`id`) ON DELETE SET NULL
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `referral_bindings` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `inviter_user_id` BIGINT NOT NULL,
  `invitee_user_id` BIGINT NOT NULL,
  `invite_id` BIGINT NULL,
  `invite_code_id` BIGINT NULL,
  `source` VARCHAR(16) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'active',
  `risk_level` VARCHAR(16) NULL,
  `risk_reason` VARCHAR(256) NULL,
  `reviewed_by` BIGINT NULL,
  `reviewed_at` DATETIME(3) NULL,
  `bound_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `referral_bindings_invitee_user_id_key` (`invitee_user_id`),
  INDEX `referral_bindings_inviter_user_id_status_idx` (`inviter_user_id`, `status`),
  INDEX `referral_bindings_status_bound_at_idx` (`status`, `bound_at`),
  CONSTRAINT `referral_bindings_inviter_user_id_fkey`
    FOREIGN KEY (`inviter_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `referral_bindings_invitee_user_id_fkey`
    FOREIGN KEY (`invitee_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `referral_bindings_invite_id_fkey`
    FOREIGN KEY (`invite_id`) REFERENCES `referral_invites`(`id`) ON DELETE SET NULL,
  CONSTRAINT `referral_bindings_invite_code_id_fkey`
    FOREIGN KEY (`invite_code_id`) REFERENCES `referral_invite_codes`(`id`) ON DELETE SET NULL
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `point_reward_events` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `event_key` VARCHAR(160) NOT NULL,
  `order_id` BIGINT NOT NULL,
  `rule_version_id` BIGINT NOT NULL,
  `beneficiary_user_id` BIGINT NOT NULL,
  `source_user_id` BIGINT NULL,
  `referral_binding_id` BIGINT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'granted',
  `base_amount` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `reward_value` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `points` INT NOT NULL,
  `reversed_points` INT NOT NULL DEFAULT 0,
  `reversed_at` DATETIME(3) NULL,
  `calculation_snapshot` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `point_reward_events_event_key_key` (`event_key`),
  INDEX `point_reward_events_order_id_created_at_idx` (`order_id`, `created_at`),
  INDEX `point_reward_events_beneficiary_user_id_created_at_idx` (`beneficiary_user_id`, `created_at`),
  INDEX `point_reward_events_source_user_id_created_at_idx` (`source_user_id`, `created_at`),
  INDEX `point_reward_events_referral_binding_id_idx` (`referral_binding_id`),
  CONSTRAINT `point_reward_events_order_id_fkey`
    FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE,
  CONSTRAINT `point_reward_events_rule_version_id_fkey`
    FOREIGN KEY (`rule_version_id`) REFERENCES `point_reward_rule_versions`(`id`),
  CONSTRAINT `point_reward_events_beneficiary_user_id_fkey`
    FOREIGN KEY (`beneficiary_user_id`) REFERENCES `users`(`id`),
  CONSTRAINT `point_reward_events_source_user_id_fkey`
    FOREIGN KEY (`source_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `point_reward_events_referral_binding_id_fkey`
    FOREIGN KEY (`referral_binding_id`) REFERENCES `referral_bindings`(`id`) ON DELETE SET NULL
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

DROP INDEX `point_ledgers_order_id_type_key` ON `point_ledgers`;

ALTER TABLE `point_ledgers`
  MODIFY COLUMN `type` VARCHAR(48) NOT NULL,
  ADD COLUMN `reward_event_id` BIGINT NULL AFTER `order_id`,
  ADD COLUMN `rule_version_id` BIGINT NULL AFTER `reward_event_id`,
  ADD COLUMN `source_user_id` BIGINT NULL AFTER `rule_version_id`,
  ADD COLUMN `referral_binding_id` BIGINT NULL AFTER `source_user_id`,
  ADD COLUMN `event_key` VARCHAR(160) NULL AFTER `referral_binding_id`,
  ADD COLUMN `reward_value` DECIMAL(10,2) NULL AFTER `amount`,
  ADD COLUMN `metadata` JSON NULL AFTER `remark`;

CREATE UNIQUE INDEX `point_ledgers_event_key_key` ON `point_ledgers`(`event_key`);
CREATE INDEX `point_ledgers_reward_event_id_idx` ON `point_ledgers`(`reward_event_id`);
CREATE INDEX `point_ledgers_rule_version_id_idx` ON `point_ledgers`(`rule_version_id`);
CREATE INDEX `point_ledgers_source_user_id_idx` ON `point_ledgers`(`source_user_id`);
CREATE INDEX `point_ledgers_referral_binding_id_idx` ON `point_ledgers`(`referral_binding_id`);

ALTER TABLE `point_ledgers`
  ADD CONSTRAINT `point_ledgers_reward_event_id_fkey`
    FOREIGN KEY (`reward_event_id`) REFERENCES `point_reward_events`(`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `point_ledgers_rule_version_id_fkey`
    FOREIGN KEY (`rule_version_id`) REFERENCES `point_reward_rule_versions`(`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `point_ledgers_source_user_id_fkey`
    FOREIGN KEY (`source_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `point_ledgers_referral_binding_id_fkey`
    FOREIGN KEY (`referral_binding_id`) REFERENCES `referral_bindings`(`id`) ON DELETE SET NULL;

INSERT INTO `point_reward_rules` (`code`, `name`, `trigger`, `status`, `current_version`)
VALUES
  ('consumer_spend', '消费积分', 'order_completed', 'active', 1),
  ('referral_first_consumption', '拉新消费奖励', 'order_completed', 'inactive', 1);

INSERT INTO `point_reward_rule_versions` (
  `rule_id`, `version`, `calculation_type`, `qualification_config`, `calculation_config`,
  `earn_points_per_yuan`, `redemption_points_per_yuan`, `snapshot`
)
SELECT
  `id`, 1, 'spend_rate',
  JSON_OBJECT('orderTypes', JSON_ARRAY('service_booking'), 'minimumPaidAmount', 0),
  JSON_OBJECT(),
  10, 200,
  JSON_OBJECT('earnPointsPerYuan', 10, 'redemptionPointsPerYuan', 200)
FROM `point_reward_rules`
WHERE `code` = 'consumer_spend';

INSERT INTO `point_reward_rule_versions` (
  `rule_id`, `version`, `calculation_type`, `qualification_config`, `calculation_config`,
  `earn_points_per_yuan`, `redemption_points_per_yuan`, `snapshot`
)
SELECT
  `id`, 1, 'fixed_points',
  JSON_OBJECT('firstOnly', true, 'orderTypes', JSON_ARRAY('service_booking'), 'minimumPaidAmount', 0),
  JSON_OBJECT('fixedPoints', 0),
  10, 200,
  JSON_OBJECT('earnPointsPerYuan', 10, 'redemptionPointsPerYuan', 200, 'fixedPoints', 0)
FROM `point_reward_rules`
WHERE `code` = 'referral_first_consumption';
