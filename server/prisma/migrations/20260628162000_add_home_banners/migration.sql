CREATE TABLE IF NOT EXISTS `home_banners` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(64) NOT NULL,
  `subtitle` VARCHAR(128) NULL,
  `image_url` VARCHAR(512) NOT NULL,
  `link_type` VARCHAR(32) NOT NULL DEFAULT 'none',
  `link_value` VARCHAR(128) NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `status` SMALLINT NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `home_banners_status_sort_order_idx` (`status`, `sort_order`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
