-- Day48: promote order addresses from an order JSON field to relational, versioned entities.

ALTER TABLE `addresses`
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT `addresses_version_check` CHECK (`version` >= 1),
  ADD CONSTRAINT `addresses_contact_name_check` CHECK (CHAR_LENGTH(TRIM(`contact_name`)) > 0),
  ADD CONSTRAINT `addresses_contact_phone_check` CHECK (CHAR_LENGTH(TRIM(`contact_phone`)) > 0),
  ADD CONSTRAINT `addresses_detail_address_check` CHECK (CHAR_LENGTH(TRIM(`detail_address`)) > 0),
  ADD CONSTRAINT `addresses_formatted_address_check` CHECK (CHAR_LENGTH(TRIM(`formatted_address`)) > 0),
  ADD CONSTRAINT `addresses_coordinate_pair_check` CHECK ((`latitude` IS NULL) = (`longitude` IS NULL)),
  ADD CONSTRAINT `addresses_latitude_range_check` CHECK (`latitude` IS NULL OR (`latitude` >= -90 AND `latitude` <= 90)),
  ADD CONSTRAINT `addresses_longitude_range_check` CHECK (`longitude` IS NULL OR (`longitude` >= -180 AND `longitude` <= 180)),
  ADD CONSTRAINT `addresses_coordinate_type_check` CHECK (`latitude` IS NULL OR CHAR_LENGTH(TRIM(`coordinate_type`)) > 0);

CREATE TABLE `address_revisions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `address_id` BIGINT NOT NULL,
  `version` INTEGER NOT NULL,
  `snapshot` JSON NOT NULL,
  `change_type` VARCHAR(32) NOT NULL,
  `operator_type` VARCHAR(16) NOT NULL,
  `operator_id` BIGINT NULL,
  `reason` VARCHAR(256) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `address_revisions_address_id_version_key`(`address_id`, `version`),
  INDEX `address_revisions_operator_type_operator_id_idx`(`operator_type`, `operator_id`),
  CONSTRAINT `address_revisions_version_check` CHECK (`version` >= 1),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `order_addresses` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT NOT NULL,
  `source_address_id` BIGINT NULL,
  `source_address_version` INTEGER NULL,
  `contact_name` VARCHAR(64) NOT NULL,
  `contact_phone` VARCHAR(20) NOT NULL,
  `country` VARCHAR(32) NULL,
  `province` VARCHAR(32) NULL,
  `city` VARCHAR(32) NULL,
  `district` VARCHAR(32) NULL,
  `street` VARCHAR(64) NULL,
  `address_title` VARCHAR(128) NULL,
  `detail_address` VARCHAR(256) NOT NULL,
  `house_number` VARCHAR(64) NULL,
  `formatted_address` VARCHAR(512) NOT NULL,
  `latitude` DECIMAL(10, 7) NULL,
  `longitude` DECIMAL(10, 7) NULL,
  `coordinate_type` VARCHAR(16) NULL,
  `poi_id` VARCHAR(128) NULL,
  `map_provider` VARCHAR(16) NULL,
  `source` VARCHAR(16) NOT NULL DEFAULT 'manual',
  `version` INTEGER NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `order_addresses_order_id_key`(`order_id`),
  INDEX `order_addresses_source_address_id_idx`(`source_address_id`),
  INDEX `order_addresses_city_district_idx`(`city`, `district`),
  INDEX `order_addresses_latitude_longitude_idx`(`latitude`, `longitude`),
  CONSTRAINT `order_addresses_version_check` CHECK (`version` >= 1),
  CONSTRAINT `order_addresses_contact_name_check` CHECK (CHAR_LENGTH(TRIM(`contact_name`)) > 0),
  CONSTRAINT `order_addresses_contact_phone_check` CHECK (CHAR_LENGTH(TRIM(`contact_phone`)) > 0),
  CONSTRAINT `order_addresses_detail_address_check` CHECK (CHAR_LENGTH(TRIM(`detail_address`)) > 0),
  CONSTRAINT `order_addresses_formatted_address_check` CHECK (CHAR_LENGTH(TRIM(`formatted_address`)) > 0),
  CONSTRAINT `order_addresses_coordinate_pair_check` CHECK ((`latitude` IS NULL) = (`longitude` IS NULL)),
  CONSTRAINT `order_addresses_latitude_range_check` CHECK (`latitude` IS NULL OR (`latitude` >= -90 AND `latitude` <= 90)),
  CONSTRAINT `order_addresses_longitude_range_check` CHECK (`longitude` IS NULL OR (`longitude` >= -180 AND `longitude` <= 180)),
  CONSTRAINT `order_addresses_coordinate_type_check` CHECK (`latitude` IS NULL OR CHAR_LENGTH(TRIM(`coordinate_type`)) > 0),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `order_address_revisions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `order_address_id` BIGINT NOT NULL,
  `version` INTEGER NOT NULL,
  `snapshot` JSON NOT NULL,
  `change_type` VARCHAR(32) NOT NULL,
  `operator_type` VARCHAR(16) NOT NULL,
  `operator_id` BIGINT NULL,
  `reason` VARCHAR(256) NULL,
  `request_id` VARCHAR(64) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `order_address_revisions_order_address_id_version_key`(`order_address_id`, `version`),
  INDEX `order_address_revisions_operator_type_operator_id_idx`(`operator_type`, `operator_id`),
  CONSTRAINT `order_address_revisions_version_check` CHECK (`version` >= 1),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `address_revisions`
  ADD CONSTRAINT `address_revisions_address_id_fkey`
  FOREIGN KEY (`address_id`) REFERENCES `addresses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `order_addresses`
  ADD CONSTRAINT `order_addresses_order_id_fkey`
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `order_addresses_source_address_id_fkey`
  FOREIGN KEY (`source_address_id`) REFERENCES `addresses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `order_address_revisions`
  ADD CONSTRAINT `order_address_revisions_order_address_id_fkey`
  FOREIGN KEY (`order_address_id`) REFERENCES `order_addresses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO `address_revisions` (
  `address_id`, `version`, `snapshot`, `change_type`, `operator_type`, `operator_id`, `reason`, `created_at`
)
SELECT
  a.`id`,
  1,
  JSON_OBJECT(
    'id', a.`id`,
    'ownerType', a.`owner_type`,
    'ownerId', a.`owner_id`,
    'addressType', a.`address_type`,
    'contactName', a.`contact_name`,
    'contactPhone', a.`contact_phone`,
    'country', a.`country`,
    'provinceName', a.`province`,
    'cityName', a.`city`,
    'districtName', a.`district`,
    'streetName', a.`street`,
    'addressTitle', a.`address_title`,
    'detailAddress', a.`detail_address`,
    'houseNumber', a.`house_number`,
    'formattedAddress', a.`formatted_address`,
    'latitude', a.`latitude`,
    'longitude', a.`longitude`,
    'coordinateType', a.`coordinate_type`,
    'poiId', a.`poi_id`,
    'mapProvider', a.`map_provider`,
    'source', a.`source`,
    'isDefault', IF(a.`is_default`, JSON_EXTRACT('true', '$'), JSON_EXTRACT('false', '$')),
    'status', a.`status`,
    'version', a.`version`,
    'deletedAt', a.`deleted_at`
  ),
  'migration',
  'system',
  NULL,
  'Day48 initial address revision',
  a.`created_at`
FROM `addresses` a;

INSERT INTO `order_addresses` (
  `order_id`, `source_address_id`, `source_address_version`,
  `contact_name`, `contact_phone`, `country`, `province`, `city`, `district`, `street`,
  `address_title`, `detail_address`, `house_number`, `formatted_address`,
  `latitude`, `longitude`, `coordinate_type`, `poi_id`, `map_provider`, `source`,
  `version`, `created_at`, `updated_at`
)
SELECT
  o.`id`,
  a.`id`,
  a.`version`,
  COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.contactName')), 'null'), ''),
  COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.contactPhone')), 'null'), ''),
  NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.country')), 'null'), ''),
  COALESCE(
    NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.provinceName')), 'null'), ''),
    NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.province')), 'null'), '')
  ),
  COALESCE(
    NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.cityName')), 'null'), ''),
    NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.city')), 'null'), '')
  ),
  COALESCE(
    NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.districtName')), 'null'), ''),
    NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.district')), 'null'), '')
  ),
  NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.streetName')), 'null'), ''),
  NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.addressTitle')), 'null'), ''),
  COALESCE(
    NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.detailAddress')), 'null'), ''),
    NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.address')), 'null'), '')
  ),
  NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.houseNumber')), 'null'), ''),
  COALESCE(
    NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.formattedAddress')), 'null'), ''),
    NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.detailAddress')), 'null'), ''),
    NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.address')), 'null'), '')
  ),
  CASE
    WHEN JSON_EXTRACT(o.`address_snapshot`, '$.latitude') IS NULL
      OR JSON_TYPE(JSON_EXTRACT(o.`address_snapshot`, '$.latitude')) = 'NULL'
    THEN NULL
    ELSE CAST(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.latitude')) AS DECIMAL(10, 7))
  END,
  CASE
    WHEN JSON_EXTRACT(o.`address_snapshot`, '$.longitude') IS NULL
      OR JSON_TYPE(JSON_EXTRACT(o.`address_snapshot`, '$.longitude')) = 'NULL'
    THEN NULL
    ELSE CAST(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.longitude')) AS DECIMAL(10, 7))
  END,
  NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.coordinateType')), 'null'), ''),
  NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.poiId')), 'null'), ''),
  NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.mapProvider')), 'null'), ''),
  'migration',
  1,
  o.`created_at`,
  o.`updated_at`
FROM `orders` o
LEFT JOIN `addresses` a
  ON a.`id` = CAST(NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.`address_snapshot`, '$.addressId')), 'null'), '') AS UNSIGNED)
  AND a.`owner_type` = 'user'
  AND a.`owner_id` = o.`user_id`
  AND a.`address_type` = 'service'
WHERE o.`order_type` IN ('service_booking', 'consultation');

INSERT INTO `order_address_revisions` (
  `order_address_id`, `version`, `snapshot`, `change_type`, `operator_type`, `operator_id`, `reason`, `request_id`, `created_at`
)
SELECT
  oa.`id`,
  1,
  JSON_OBJECT(
    'id', oa.`id`,
    'orderId', oa.`order_id`,
    'sourceAddressId', oa.`source_address_id`,
    'sourceAddressVersion', oa.`source_address_version`,
    'contactName', oa.`contact_name`,
    'contactPhone', oa.`contact_phone`,
    'country', oa.`country`,
    'provinceName', oa.`province`,
    'cityName', oa.`city`,
    'districtName', oa.`district`,
    'streetName', oa.`street`,
    'addressTitle', oa.`address_title`,
    'detailAddress', oa.`detail_address`,
    'houseNumber', oa.`house_number`,
    'formattedAddress', oa.`formatted_address`,
    'latitude', oa.`latitude`,
    'longitude', oa.`longitude`,
    'coordinateType', oa.`coordinate_type`,
    'poiId', oa.`poi_id`,
    'mapProvider', oa.`map_provider`,
    'source', oa.`source`,
    'version', oa.`version`
  ),
  'migration',
  'system',
  NULL,
  'Day48 migrated order address',
  NULL,
  oa.`created_at`
FROM `order_addresses` oa;

ALTER TABLE `orders`
  DROP COLUMN `address_snapshot`;
