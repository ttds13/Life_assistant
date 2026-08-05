-- Day53: promote member-card templates to first-class products with explicit
-- draft/publish boundaries while keeping sold versions immutable.

ALTER TABLE `member_cards`
  ADD COLUMN `code` VARCHAR(64) NULL,
  ADD COLUMN `description` VARCHAR(255) NULL,
  ADD COLUMN `detail` TEXT NULL,
  ADD COLUMN `cover_image` VARCHAR(512) NULL,
  ADD COLUMN `purchase_notice` TEXT NULL,
  ADD COLUMN `sort_order` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `published_version_id` BIGINT NULL,
  ADD COLUMN `draft_source_version_id` BIGINT NULL,
  ADD COLUMN `draft_revision` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `published_revision` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `published_at` DATETIME(3) NULL,
  ADD COLUMN `deleted_at` DATETIME(3) NULL;

UPDATE `member_cards`
SET `code` = CONCAT('MC-', LPAD(`id`, 6, '0'))
WHERE `code` IS NULL OR `code` = '';

-- Convert resolvable legacy service references into the structured draft rules
-- before the published snapshots are wired to Miniapp reads.
INSERT IGNORE INTO `member_card_service_rules` (
  `member_card_id`, `service_id`, `consume_units`, `consume_mode`,
  `min_consume_minutes`, `allowed_minutes`, `status`, `remark`, `created_at`, `updated_at`
)
SELECT
  legacy.`member_card_id`,
  legacy.`service_id`,
  legacy.`consume_minutes`,
  'fixed_minutes',
  legacy.`consume_minutes`,
  JSON_ARRAY(),
  1,
  'day53 legacy applicableServices migration',
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM (
  SELECT
    card.`id` AS `member_card_id`,
    service.`id` AS `service_id`,
    GREATEST(
      1,
      COALESCE(NULLIF(service.`duration_minutes`, 0), NULLIF(card.`unit_minutes`, 0), 1)
    ) AS `consume_minutes`
  FROM `member_cards` card
  INNER JOIN JSON_TABLE(
    card.`applicable_services`,
    '$[*]' COLUMNS (`token` VARCHAR(255) PATH '$')
  ) applicable ON TRUE
  INNER JOIN `services` service
    ON CAST(service.`id` AS CHAR) COLLATE utf8mb4_unicode_ci = applicable.`token` COLLATE utf8mb4_unicode_ci
    OR service.`code` = applicable.`token` COLLATE utf8mb4_unicode_ci
    OR service.`name` = applicable.`token` COLLATE utf8mb4_unicode_ci
  WHERE service.`deleted_at` IS NULL
  GROUP BY card.`id`, service.`id`, service.`duration_minutes`, card.`unit_minutes`
) legacy;

-- Existing products get a compatibility cover from their first resolvable
-- service. Marketing copy remains empty until Admin explicitly supplies it.
UPDATE `member_cards` card
SET card.`cover_image` = (
  SELECT service.`cover_image`
  FROM `member_card_service_rules` rule_item
  INNER JOIN `services` service ON service.`id` = rule_item.`service_id`
  WHERE rule_item.`member_card_id` = card.`id`
    AND service.`cover_image` IS NOT NULL
    AND service.`cover_image` <> ''
  ORDER BY rule_item.`id`
  LIMIT 1
)
WHERE card.`cover_image` IS NULL;

ALTER TABLE `member_cards`
  MODIFY COLUMN `code` VARCHAR(64) NOT NULL,
  MODIFY COLUMN `current_version` INTEGER NOT NULL DEFAULT 0,
  DROP CHECK `member_cards_current_version_check`,
  ADD CONSTRAINT `member_cards_current_version_check` CHECK (`current_version` >= 0),
  ADD UNIQUE INDEX `member_cards_code_key`(`code`),
  ADD UNIQUE INDEX `member_cards_published_version_id_key`(`published_version_id`),
  ADD INDEX `member_cards_status_sort_order_idx`(`status`, `sort_order`),
  ADD INDEX `member_cards_deleted_at_idx`(`deleted_at`);

ALTER TABLE `member_card_plan_versions`
  ADD COLUMN `product_code` VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN `product_name` VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN `description` VARCHAR(255) NULL,
  ADD COLUMN `detail` TEXT NULL,
  ADD COLUMN `cover_image` VARCHAR(512) NULL,
  ADD COLUMN `price` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `purchase_notice` TEXT NULL,
  ADD COLUMN `published_by` BIGINT NULL,
  ADD COLUMN `source_version_id` BIGINT NULL;

UPDATE `member_card_plan_versions` version
INNER JOIN `member_cards` card ON card.`id` = version.`member_card_id`
SET
  version.`product_code` = card.`code`,
  version.`product_name` = COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(version.`snapshot`, '$.name')), ''), card.`name`),
  version.`description` = card.`description`,
  version.`detail` = card.`detail`,
  version.`cover_image` = card.`cover_image`,
  version.`price` = card.`price`,
  version.`purchase_notice` = card.`purchase_notice`,
  version.`snapshot` = JSON_SET(
    version.`snapshot`,
    '$.code', card.`code`,
    '$.name', card.`name`,
    '$.description', COALESCE(card.`description`, ''),
    '$.detail', COALESCE(card.`detail`, ''),
    '$.coverImage', COALESCE(card.`cover_image`, ''),
    '$.purchaseNotice', COALESCE(card.`purchase_notice`, ''),
    '$.price', card.`price`
  );

-- Day49 versions may predate the structured rule backfill. Only the current
-- version is promoted as the Day53 published product, so enrich that version
-- with the resolved immutable service-rule snapshot.
UPDATE `member_card_plan_versions` version
INNER JOIN `member_cards` card
  ON card.`id` = version.`member_card_id`
  AND card.`current_version` = version.`version`
INNER JOIN (
  SELECT
    rule_item.`member_card_id`,
    JSON_ARRAYAGG(JSON_OBJECT(
      'serviceRuleId', rule_item.`id`,
      'serviceId', rule_item.`service_id`,
      'serviceCode', service.`code`,
      'serviceName', service.`name`,
      'serviceDurationMinutes', COALESCE(service.`duration_minutes`, 0),
      'consumeMode', rule_item.`consume_mode`,
      'consumeMinutes', rule_item.`consume_units`,
      'minConsumeMinutes', rule_item.`min_consume_minutes`,
      'allowedMinutes', COALESCE(rule_item.`allowed_minutes`, JSON_ARRAY()),
      'remark', COALESCE(rule_item.`remark`, '')
    )) AS `rules`
  FROM `member_card_service_rules` rule_item
  INNER JOIN `services` service ON service.`id` = rule_item.`service_id`
  WHERE rule_item.`status` = 1
  GROUP BY rule_item.`member_card_id`
) resolved ON resolved.`member_card_id` = card.`id`
SET
  version.`redemption_rules` = resolved.`rules`,
  version.`snapshot` = JSON_SET(version.`snapshot`, '$.redemptionRules', resolved.`rules`)
WHERE JSON_LENGTH(version.`redemption_rules`) = 0;

UPDATE `member_cards` card
LEFT JOIN `member_card_plan_versions` version
  ON version.`member_card_id` = card.`id`
  AND version.`version` = card.`current_version`
SET
  card.`published_version_id` = version.`id`,
  card.`draft_revision` = GREATEST(card.`current_version`, 1),
  card.`published_revision` = CASE WHEN version.`id` IS NULL THEN 0 ELSE GREATEST(card.`current_version`, 1) END,
  card.`published_at` = version.`published_at`;

ALTER TABLE `member_card_plan_versions`
  DROP FOREIGN KEY `member_card_plan_versions_member_card_id_fkey`;

ALTER TABLE `member_card_plan_versions`
  ADD CONSTRAINT `member_card_plan_versions_member_card_id_fkey`
    FOREIGN KEY (`member_card_id`) REFERENCES `member_cards`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `member_cards`
  ADD CONSTRAINT `member_cards_published_version_id_fkey`
    FOREIGN KEY (`published_version_id`) REFERENCES `member_card_plan_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
