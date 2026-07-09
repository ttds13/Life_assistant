ALTER TABLE `orders`
  ADD COLUMN `member_card_rule_snapshot` JSON NULL;

CREATE TABLE `member_card_service_rules` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `member_card_id` BIGINT NOT NULL,
  `service_id` BIGINT NOT NULL,
  `consume_units` INTEGER NOT NULL,
  `status` SMALLINT NOT NULL DEFAULT 1,
  `remark` VARCHAR(256) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `member_card_service_rules_member_card_id_service_id_key`
  ON `member_card_service_rules`(`member_card_id`, `service_id`);
CREATE INDEX `member_card_service_rules_service_id_idx`
  ON `member_card_service_rules`(`service_id`);
CREATE INDEX `member_card_service_rules_member_card_id_status_idx`
  ON `member_card_service_rules`(`member_card_id`, `status`);

ALTER TABLE `member_card_service_rules`
  ADD CONSTRAINT `member_card_service_rules_member_card_id_fkey`
  FOREIGN KEY (`member_card_id`) REFERENCES `member_cards`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `member_card_service_rules`
  ADD CONSTRAINT `member_card_service_rules_service_id_fkey`
  FOREIGN KEY (`service_id`) REFERENCES `services`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
