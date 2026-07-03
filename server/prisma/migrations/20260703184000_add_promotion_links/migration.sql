CREATE TABLE IF NOT EXISTS `promotion_links` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `link_key` VARCHAR(64) NOT NULL,
  `title` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NULL,
  `target_type` VARCHAR(32) NOT NULL,
  `target_id` BIGINT NULL,
  `target_code` VARCHAR(100) NULL,
  `source` VARCHAR(32) NOT NULL DEFAULT 'channels',
  `campaign_id` BIGINT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `status` SMALLINT NOT NULL DEFAULT 1,
  `start_at` DATETIME(3) NULL,
  `end_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `promotion_links_link_key_key` (`link_key`),
  INDEX `promotion_links_status_sort_order_idx` (`status`, `sort_order`),
  INDEX `promotion_links_target_type_idx` (`target_type`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
