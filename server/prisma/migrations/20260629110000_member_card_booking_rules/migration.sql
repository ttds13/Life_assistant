ALTER TABLE `services`
  ADD COLUMN `card_type` VARCHAR(32) NOT NULL DEFAULT 'none',
  ADD COLUMN `consume_unit` INTEGER NULL,
  ADD COLUMN `consultation_required` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `orders`
  ADD COLUMN `order_type` VARCHAR(32) NOT NULL DEFAULT 'service',
  ADD COLUMN `member_card_consume_units` INTEGER NOT NULL DEFAULT 0;

ALTER TABLE `member_cards`
  ADD COLUMN `card_type` VARCHAR(32) NOT NULL DEFAULT 'times',
  ADD COLUMN `unit_name` VARCHAR(16) NOT NULL DEFAULT '次',
  ADD COLUMN `unit_minutes` INTEGER NULL,
  ADD COLUMN `total_units` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `service_rules` JSON NULL,
  ADD COLUMN `allow_half_deduct` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `min_consume_units` INTEGER NOT NULL DEFAULT 1;

UPDATE `member_cards`
SET
  `total_units` = CASE WHEN `total_units` > 0 THEN `total_units` ELSE `total_times` END,
  `min_consume_units` = CASE WHEN `min_consume_units` > 0 THEN `min_consume_units` ELSE 1 END;

ALTER TABLE `user_member_cards`
  ADD COLUMN `remaining_units` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `frozen_units` INTEGER NOT NULL DEFAULT 0;

UPDATE `user_member_cards`
SET `remaining_units` = CASE WHEN `remaining_units` > 0 THEN `remaining_units` ELSE `remaining_times` END;

ALTER TABLE `member_card_records`
  MODIFY COLUMN `order_id` BIGINT NULL,
  ADD COLUMN `record_type` VARCHAR(16) NOT NULL DEFAULT 'consume',
  ADD COLUMN `units` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `before_units` INTEGER NULL,
  ADD COLUMN `after_units` INTEGER NULL,
  ADD COLUMN `operator_type` VARCHAR(16) NULL,
  ADD COLUMN `operator_id` BIGINT NULL,
  ADD COLUMN `remark` VARCHAR(256) NULL;

CREATE INDEX `member_card_records_order_id_idx` ON `member_card_records`(`order_id`);

UPDATE `services`
SET
  `duration_minutes` = CASE
    WHEN `name` LIKE '%2 小时%' OR `name` LIKE '%2 灏忔椂%' THEN 120
    WHEN `name` LIKE '%3 小时%' OR `name` LIKE '%3 灏忔椂%' THEN 180
    WHEN `name` LIKE '%4 小时%' OR `name` LIKE '%4 灏忔椂%' THEN 240
    ELSE `duration_minutes`
  END,
  `card_type` = CASE
    WHEN `price_unit` = '咨询' OR `price_unit` = '鍜ㄨ' OR `name` LIKE '%咨询%' OR `name` LIKE '%鍜ㄨ%' THEN 'consultation'
    WHEN `price_unit` = '小时' OR `price_unit` = '灏忔椂' OR `name` LIKE '%小时%' OR `name` LIKE '%灏忔椂%' THEN 'time'
    WHEN `price_unit` IN ('次', '台', '张', '娆?', '鍙?', '寮?') THEN 'times'
    ELSE 'none'
  END,
  `consume_unit` = CASE
    WHEN `name` LIKE '%2 小时%' OR `name` LIKE '%2 灏忔椂%' THEN 120
    WHEN `name` LIKE '%3 小时%' OR `name` LIKE '%3 灏忔椂%' THEN 180
    WHEN `name` LIKE '%4 小时%' OR `name` LIKE '%4 灏忔椂%' THEN 240
    WHEN `price_unit` IN ('次', '台', '张', '娆?', '鍙?', '寮?') THEN 1
    ELSE `consume_unit`
  END,
  `consultation_required` = CASE
    WHEN `price_unit` = '咨询' OR `price_unit` = '鍜ㄨ' OR `name` LIKE '%咨询%' OR `name` LIKE '%鍜ㄨ%' THEN true
    ELSE false
  END;
