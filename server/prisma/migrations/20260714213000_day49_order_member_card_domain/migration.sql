-- Day49: separate service fulfillment from card purchase, version member-card plans,
-- and migrate entitlement accounting to integer minutes.
--
-- This is an expand-and-backfill migration. Legacy order/card columns remain until all
-- three clients read the Day49 model and a later cleanup migration is approved.

ALTER TABLE `member_cards`
  ADD COLUMN `activation_deadline_days` INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN `current_version` INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT `member_cards_activation_deadline_days_check` CHECK (`activation_deadline_days` > 0),
  ADD CONSTRAINT `member_cards_current_version_check` CHECK (`current_version` >= 1);

ALTER TABLE `member_card_service_rules`
  ADD COLUMN `consume_mode` VARCHAR(32) NOT NULL DEFAULT 'fixed_minutes',
  ADD COLUMN `min_consume_minutes` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `allowed_minutes` JSON NULL,
  ADD CONSTRAINT `member_card_service_rules_min_consume_minutes_check` CHECK (`min_consume_minutes` > 0);

CREATE TABLE `member_card_plan_versions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `member_card_id` BIGINT NOT NULL,
  `version` INTEGER NOT NULL,
  `total_minutes` INTEGER NOT NULL,
  `activation_deadline_days` INTEGER NOT NULL,
  `validity_days` INTEGER NOT NULL,
  `redemption_rules` JSON NOT NULL,
  `snapshot` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `published_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `member_card_plan_versions_member_card_id_version_key`(`member_card_id`, `version`),
  INDEX `member_card_plan_versions_member_card_id_published_at_idx`(`member_card_id`, `published_at`),
  CONSTRAINT `member_card_plan_versions_total_minutes_check` CHECK (`total_minutes` >= 0),
  CONSTRAINT `member_card_plan_versions_activation_deadline_days_check` CHECK (`activation_deadline_days` > 0),
  CONSTRAINT `member_card_plan_versions_validity_days_check` CHECK (`validity_days` > 0),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `user_member_cards`
  ADD COLUMN `purchase_order_id` BIGINT NULL,
  ADD COLUMN `plan_version` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `plan_snapshot` JSON NULL,
  MODIFY COLUMN `status` VARCHAR(32) NOT NULL,
  ADD COLUMN `completed_reason` VARCHAR(16) NULL,
  ADD COLUMN `issued_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `activation_deadline_at` DATETIME(3) NULL,
  ADD COLUMN `activated_at` DATETIME(3) NULL,
  MODIFY COLUMN `expire_at` DATETIME(3) NULL,
  ADD COLUMN `completed_at` DATETIME(3) NULL,
  ADD COLUMN `total_minutes` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `remaining_minutes` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `frozen_minutes` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `availability_state` VARCHAR(16) NOT NULL DEFAULT 'available',
  ADD COLUMN `suspended_at` DATETIME(3) NULL,
  ADD COLUMN `suspended_reason` VARCHAR(256) NULL,
  ADD UNIQUE INDEX `user_member_cards_purchase_order_id_key`(`purchase_order_id`),
  ADD INDEX `user_member_cards_activation_deadline_at_idx`(`activation_deadline_at`),
  ADD INDEX `user_member_cards_expire_at_idx`(`expire_at`),
  ADD CONSTRAINT `user_member_cards_minutes_check` CHECK (`remaining_minutes` >= `frozen_minutes` AND `frozen_minutes` >= 0),
  ADD CONSTRAINT `user_member_cards_plan_version_check` CHECK (`plan_version` >= 1);

CREATE TABLE `service_booking_orders` (
  `order_id` BIGINT NOT NULL,
  `service_id` BIGINT NOT NULL,
  `service_snapshot` JSON NOT NULL,
  `staff_id` BIGINT NULL,
  `appointment_start_at` DATETIME(3) NOT NULL,
  `appointment_end_at` DATETIME(3) NOT NULL,
  `fulfilled_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `service_booking_orders_staff_id_appointment_start_at_idx`(`staff_id`, `appointment_start_at`),
  INDEX `service_booking_orders_service_id_appointment_start_at_idx`(`service_id`, `appointment_start_at`),
  CONSTRAINT `service_booking_orders_appointment_check` CHECK (`appointment_end_at` >= `appointment_start_at`),
  PRIMARY KEY (`order_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `member_card_purchase_orders` (
  `order_id` BIGINT NOT NULL,
  `member_card_plan_id` BIGINT NOT NULL,
  `member_card_plan_version` INTEGER NOT NULL,
  `plan_snapshot` JSON NOT NULL,
  `granted_user_member_card_id` BIGINT NULL,
  `granted_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `member_card_purchase_orders_granted_user_member_card_id_key`(`granted_user_member_card_id`),
  INDEX `mcpo_plan_version_idx`(`member_card_plan_id`, `member_card_plan_version`),
  PRIMARY KEY (`order_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `order_redemptions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT NOT NULL,
  `user_member_card_id` BIGINT NOT NULL,
  `state` VARCHAR(16) NOT NULL,
  `reserved_minutes` INTEGER NOT NULL,
  `consumed_minutes` INTEGER NOT NULL DEFAULT 0,
  `released_minutes` INTEGER NOT NULL DEFAULT 0,
  `actual_service_minutes` INTEGER NULL,
  `rule_snapshot` JSON NOT NULL,
  `activated_card` BOOLEAN NOT NULL DEFAULT false,
  `reserved_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `settled_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `order_redemptions_order_id_key`(`order_id`),
  INDEX `order_redemptions_user_member_card_id_state_idx`(`user_member_card_id`, `state`),
  CONSTRAINT `order_redemptions_amounts_check` CHECK (
    `reserved_minutes` >= 0 AND `consumed_minutes` >= 0 AND `released_minutes` >= 0
  ),
  CONSTRAINT `order_redemptions_state_check` CHECK (`state` IN ('reserved', 'consumed', 'released')),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `member_card_records`
  ADD COLUMN `redemption_id` BIGINT NULL,
  ADD COLUMN `before_remaining_minutes` INTEGER NULL,
  ADD COLUMN `after_remaining_minutes` INTEGER NULL,
  ADD COLUMN `before_frozen_minutes` INTEGER NULL,
  ADD COLUMN `after_frozen_minutes` INTEGER NULL,
  ADD INDEX `member_card_records_redemption_id_idx`(`redemption_id`);

-- Normalize existing ledger event names before using them for lifecycle backfill.
UPDATE `member_card_records`
SET `record_type` = CASE `record_type`
  WHEN 'grant' THEN 'issued'
  WHEN 'freeze' THEN 'reserved'
  WHEN 'consume' THEN 'consumed'
  WHEN 'release' THEN 'released'
  WHEN 'refund_revoke' THEN 'refunded'
  ELSE `record_type`
END;

-- Version every existing template before creating purchase or entitlement snapshots.
INSERT INTO `member_card_plan_versions` (
  `member_card_id`, `version`, `total_minutes`, `activation_deadline_days`, `validity_days`,
  `redemption_rules`, `snapshot`, `created_at`, `published_at`
)
SELECT
  mc.`id`,
  1,
  CASE
    WHEN mc.`total_units` > 0 THEN mc.`total_units`
    WHEN mc.`unit_minutes` IS NOT NULL AND mc.`total_times` > 0 THEN mc.`unit_minutes` * mc.`total_times`
    ELSE mc.`total_times`
  END,
  mc.`activation_deadline_days`,
  mc.`validity_days`,
  COALESCE((
    SELECT JSON_ARRAYAGG(JSON_OBJECT(
      'serviceId', sr.`service_id`,
      'consumeMode', sr.`consume_mode`,
      'consumeMinutes', sr.`consume_units`,
      'minConsumeMinutes', sr.`min_consume_minutes`,
      'allowedMinutes', sr.`allowed_minutes`,
      'status', sr.`status`,
      'remark', sr.`remark`
    ))
    FROM `member_card_service_rules` sr
    WHERE sr.`member_card_id` = mc.`id`
  ), JSON_ARRAY()),
  JSON_OBJECT(
    'id', mc.`id`,
    'name', mc.`name`,
    'cardType', mc.`card_type`,
    'unitName', mc.`unit_name`,
    'unitMinutes', mc.`unit_minutes`,
    'totalMinutes', CASE
      WHEN mc.`total_units` > 0 THEN mc.`total_units`
      WHEN mc.`unit_minutes` IS NOT NULL AND mc.`total_times` > 0 THEN mc.`unit_minutes` * mc.`total_times`
      ELSE mc.`total_times`
    END,
    'activationDeadlineDays', mc.`activation_deadline_days`,
    'validityDays', mc.`validity_days`,
    'serviceRules', COALESCE(mc.`service_rules`, JSON_OBJECT()),
    'redemptionRules', COALESCE((
      SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'serviceId', sr.`service_id`,
        'consumeMode', sr.`consume_mode`,
        'consumeMinutes', sr.`consume_units`,
        'minConsumeMinutes', sr.`min_consume_minutes`,
        'allowedMinutes', sr.`allowed_minutes`,
        'status', sr.`status`,
        'remark', sr.`remark`
      ))
      FROM `member_card_service_rules` sr
      WHERE sr.`member_card_id` = mc.`id`
    ), JSON_ARRAY())
  ),
  mc.`created_at`,
  mc.`updated_at`
FROM `member_cards` mc;

-- Service and purchase extensions copy immutable order facts from the legacy common table.
INSERT INTO `service_booking_orders` (
  `order_id`, `service_id`, `service_snapshot`, `staff_id`, `appointment_start_at`,
  `appointment_end_at`, `fulfilled_at`, `created_at`, `updated_at`
)
SELECT
  o.`id`, o.`service_id`, o.`service_snapshot`, o.`staff_id`, o.`appointment_start_time`,
  o.`appointment_end_time`, o.`completed_at`, o.`created_at`, o.`updated_at`
FROM `orders` o
WHERE o.`order_type` IN ('service_booking', 'consultation');

INSERT INTO `member_card_purchase_orders` (
  `order_id`, `member_card_plan_id`, `member_card_plan_version`, `plan_snapshot`,
  `granted_user_member_card_id`, `granted_at`, `created_at`, `updated_at`
)
SELECT
  o.`id`, COALESCE(o.`purchase_card_id`, o.`member_card_id`), 1, v.`snapshot`,
  o.`granted_user_member_card_id`, o.`completed_at`, o.`created_at`, o.`updated_at`
FROM `orders` o
INNER JOIN `member_card_plan_versions` v
  ON v.`member_card_id` = COALESCE(o.`purchase_card_id`, o.`member_card_id`) AND v.`version` = 1
WHERE o.`order_type` = 'member_card_purchase'
  AND COALESCE(o.`purchase_card_id`, o.`member_card_id`) IS NOT NULL;

-- Existing cards used before Day49 remain active; unconsumed cards become pending activation.
UPDATE `user_member_cards` u
INNER JOIN `member_cards` mc ON mc.`id` = u.`card_id`
LEFT JOIN `member_card_plan_versions` v
  ON v.`member_card_id` = u.`card_id` AND v.`version` = 1
LEFT JOIN `orders` po ON po.`granted_user_member_card_id` = u.`id`
LEFT JOIN (
  SELECT `user_member_card_id`, MIN(`created_at`) AS `first_used_at`
  FROM `member_card_records`
  WHERE `record_type` IN ('reserved', 'consumed', 'released')
  GROUP BY `user_member_card_id`
) card_activity ON card_activity.`user_member_card_id` = u.`id`
SET
  u.`purchase_order_id` = po.`id`,
  u.`plan_version` = 1,
  u.`plan_snapshot` = v.`snapshot`,
  u.`issued_at` = u.`created_at`,
  u.`total_minutes` = CASE
    WHEN mc.`total_units` > 0 THEN mc.`total_units`
    WHEN mc.`unit_minutes` IS NOT NULL AND mc.`total_times` > 0 THEN mc.`unit_minutes` * mc.`total_times`
    ELSE mc.`total_times`
  END,
  u.`remaining_minutes` = u.`remaining_units`,
  u.`frozen_minutes` = u.`frozen_units`,
  u.`availability_state` = 'available',
  u.`completed_reason` = CASE
    WHEN u.`status` = 'expired' THEN 'expired'
    WHEN u.`status` = 'used_up' THEN 'used_up'
    WHEN u.`status` = 'refunded' THEN 'refunded'
    WHEN u.`status` = 'disabled' THEN 'disabled'
    ELSE NULL
  END,
  u.`activation_deadline_at` = CASE
    WHEN u.`status` = 'active' AND card_activity.`first_used_at` IS NULL
      THEN DATE_ADD(u.`created_at`, INTERVAL mc.`activation_deadline_days` DAY)
    ELSE NULL
  END,
  u.`activated_at` = CASE
    WHEN card_activity.`first_used_at` IS NOT NULL THEN card_activity.`first_used_at`
    ELSE NULL
  END,
  u.`completed_at` = CASE
    WHEN u.`status` IN ('expired', 'used_up', 'refunded', 'disabled') THEN COALESCE(u.`expire_at`, u.`updated_at`)
    ELSE NULL
  END,
  u.`expire_at` = CASE
    WHEN u.`status` = 'active' AND card_activity.`first_used_at` IS NULL THEN NULL
    ELSE u.`expire_at`
  END,
  u.`status` = CASE
    WHEN u.`status` IN ('expired', 'used_up', 'refunded', 'disabled') THEN 'completed'
    WHEN card_activity.`first_used_at` IS NULL THEN 'pending_activation'
    ELSE 'active'
  END;

-- Attach pre-Day49 service bookings to their card reservation lifecycle.
INSERT INTO `order_redemptions` (
  `order_id`, `user_member_card_id`, `state`, `reserved_minutes`, `consumed_minutes`,
  `released_minutes`, `actual_service_minutes`, `rule_snapshot`, `activated_card`,
  `reserved_at`, `settled_at`, `created_at`, `updated_at`
)
SELECT
  o.`id`, o.`member_card_id`,
  CASE
    WHEN o.`status` IN ('completed', 'pending_confirm') THEN 'consumed'
    WHEN o.`status` IN ('cancelled', 'refunded') THEN 'released'
    ELSE 'reserved'
  END,
  o.`member_card_consume_units`,
  CASE WHEN o.`status` IN ('completed', 'pending_confirm') THEN o.`member_card_consume_units` ELSE 0 END,
  CASE WHEN o.`status` IN ('cancelled', 'refunded') THEN o.`member_card_consume_units` ELSE 0 END,
  NULL,
  COALESCE(o.`member_card_rule_snapshot`, JSON_OBJECT('migration', true, 'consumeMinutes', o.`member_card_consume_units`)),
  false,
  o.`created_at`,
  CASE WHEN o.`status` IN ('completed', 'pending_confirm', 'cancelled', 'refunded') THEN o.`updated_at` ELSE NULL END,
  o.`created_at`, o.`updated_at`
FROM `orders` o
INNER JOIN `service_booking_orders` sbo ON sbo.`order_id` = o.`id`
WHERE o.`member_card_id` IS NOT NULL;

UPDATE `member_card_records` r
LEFT JOIN `order_redemptions` redemption ON redemption.`order_id` = r.`order_id`
SET
  r.`redemption_id` = redemption.`id`,
  r.`before_remaining_minutes` = r.`before_units`,
  r.`after_remaining_minutes` = r.`after_units`,
  r.`before_frozen_minutes` = CASE
    WHEN r.`record_type` = 'reserved' THEN 0
    ELSE NULL
  END,
  r.`after_frozen_minutes` = CASE
    WHEN r.`record_type` = 'reserved' THEN r.`units`
    WHEN r.`record_type` IN ('consumed', 'released') THEN 0
    ELSE NULL
  END;

ALTER TABLE `service_booking_orders`
  ADD CONSTRAINT `service_booking_orders_order_id_fkey`
    FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `service_booking_orders_service_id_fkey`
    FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `service_booking_orders_staff_id_fkey`
    FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `member_card_purchase_orders`
  ADD CONSTRAINT `member_card_purchase_orders_order_id_fkey`
    FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `member_card_purchase_orders_member_card_plan_id_fkey`
    FOREIGN KEY (`member_card_plan_id`) REFERENCES `member_cards`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `member_card_purchase_orders_granted_user_member_card_id_fkey`
    FOREIGN KEY (`granted_user_member_card_id`) REFERENCES `user_member_cards`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `member_card_plan_versions`
  ADD CONSTRAINT `member_card_plan_versions_member_card_id_fkey`
    FOREIGN KEY (`member_card_id`) REFERENCES `member_cards`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `user_member_cards`
  ADD CONSTRAINT `user_member_cards_purchase_order_id_fkey`
    FOREIGN KEY (`purchase_order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `order_redemptions`
  ADD CONSTRAINT `order_redemptions_order_id_fkey`
    FOREIGN KEY (`order_id`) REFERENCES `service_booking_orders`(`order_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `order_redemptions_user_member_card_id_fkey`
    FOREIGN KEY (`user_member_card_id`) REFERENCES `user_member_cards`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `member_card_records`
  ADD CONSTRAINT `member_card_records_redemption_id_fkey`
    FOREIGN KEY (`redemption_id`) REFERENCES `order_redemptions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
