CREATE TABLE `addresses` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `uuid` VARCHAR(36) NOT NULL,
  `owner_type` VARCHAR(16) NOT NULL,
  `owner_id` BIGINT NOT NULL,
  `address_type` VARCHAR(32) NOT NULL DEFAULT 'service',
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
  `is_default` BOOLEAN NOT NULL DEFAULT false,
  `source` VARCHAR(16) NOT NULL DEFAULT 'manual',
  `status` SMALLINT NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `addresses_uuid_key` (`uuid`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `orders` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `order_type` VARCHAR(32) NOT NULL,
  `address_snapshot` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `addresses` (
  `id`, `uuid`, `owner_type`, `owner_id`, `address_type`, `contact_name`, `contact_phone`,
  `province`, `city`, `district`, `street`, `address_title`, `detail_address`, `house_number`,
  `formatted_address`, `latitude`, `longitude`, `coordinate_type`, `poi_id`, `map_provider`,
  `is_default`, `source`, `status`, `created_at`, `updated_at`
) VALUES
  (
    1, '00000000-0000-0000-0000-000000000001', 'user', 100, 'service', '测试用户甲', '13800000001',
    '广东省', '深圳市', '南山区', '粤海街道', '测试大厦', '科技园测试路1号', 'A座101',
    '广东省深圳市南山区科技园测试路1号A座101', 22.5400000, 113.9300000, 'gcj02', 'poi-test-1', 'tencent',
    true, 'map', 1, '2026-07-01 09:00:00.000', '2026-07-01 09:00:00.000'
  ),
  (
    2, '00000000-0000-0000-0000-000000000002', 'user', 200, 'service', '测试用户乙', '13800000002',
    '广东省', '深圳市', '福田区', NULL, NULL, '测试路2号', NULL,
    '广东省深圳市福田区测试路2号', NULL, NULL, NULL, NULL, NULL,
    true, 'manual', 1, '2026-07-01 10:00:00.000', '2026-07-01 10:00:00.000'
  );

INSERT INTO `orders` (`id`, `user_id`, `order_type`, `address_snapshot`, `created_at`, `updated_at`) VALUES
  (
    10, 100, 'service_booking',
    JSON_OBJECT(
      'addressId', 1, 'contactName', '测试用户甲', 'contactPhone', '13800000001',
      'provinceName', '广东省', 'cityName', '深圳市', 'districtName', '南山区',
      'streetName', '粤海街道', 'addressTitle', '测试大厦', 'detailAddress', '科技园测试路1号',
      'houseNumber', 'A座101', 'formattedAddress', '广东省深圳市南山区科技园测试路1号A座101',
      'latitude', 22.5400000, 'longitude', 113.9300000, 'coordinateType', 'gcj02',
      'poiId', 'poi-test-1', 'mapProvider', 'tencent'
    ),
    '2026-07-02 09:00:00.000', '2026-07-02 09:00:00.000'
  ),
  (
    11, 100, 'consultation',
    JSON_OBJECT(
      'contactName', '测试用户甲', 'contactPhone', '13800000001',
      'province', '广东省', 'city', '深圳市', 'district', '南山区',
      'address', '手动填写测试路3号', 'formattedAddress', '广东省深圳市南山区手动填写测试路3号'
    ),
    '2026-07-02 10:00:00.000', '2026-07-02 10:00:00.000'
  ),
  (
    12, 100, 'member_card_purchase', NULL,
    '2026-07-02 11:00:00.000', '2026-07-02 11:00:00.000'
  ),
  (
    13, 100, 'service_booking',
    JSON_OBJECT(
      'addressId', 2, 'contactName', '测试用户甲', 'contactPhone', '13800000001',
      'provinceName', '广东省', 'cityName', '深圳市', 'districtName', '福田区',
      'detailAddress', '订单自有测试路4号', 'formattedAddress', '广东省深圳市福田区订单自有测试路4号'
    ),
    '2026-07-02 12:00:00.000', '2026-07-02 12:00:00.000'
  );
