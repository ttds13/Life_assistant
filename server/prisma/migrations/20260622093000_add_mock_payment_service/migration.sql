SET @daily_cleaning_category_count := (
  SELECT COUNT(*)
  FROM `service_categories`
  WHERE `name` = '日常保洁'
);

INSERT INTO `service_categories` (
  `name`,
  `icon`,
  `sort_order`,
  `status`,
  `created_at`,
  `updated_at`
)
SELECT
  '日常保洁',
  'i-carbon-clean',
  1,
  1,
  NOW(3),
  NOW(3)
FROM DUAL
WHERE @daily_cleaning_category_count = 0;

SET @daily_cleaning_category_id := (
  SELECT `id`
  FROM `service_categories`
  WHERE `name` = '日常保洁'
  ORDER BY `id` ASC
  LIMIT 1
);

UPDATE `services`
SET
  `category_id` = @daily_cleaning_category_id,
  `description` = '用于小程序模拟支付链路测试，创建订单后可走 0.01 元模拟支付。',
  `base_price` = 0.01,
  `price_unit` = '次',
  `sort_order` = 0,
  `status` = 1,
  `deleted_at` = NULL,
  `updated_at` = NOW(3)
WHERE `name` = '0.01测试支付'
  AND @daily_cleaning_category_id IS NOT NULL;

SET @mock_payment_service_count := (
  SELECT COUNT(*)
  FROM `services`
  WHERE `name` = '0.01测试支付'
    AND `deleted_at` IS NULL
);

INSERT INTO `services` (
  `uuid`,
  `category_id`,
  `name`,
  `description`,
  `base_price`,
  `price_unit`,
  `status`,
  `sort_order`,
  `rating`,
  `created_at`,
  `updated_at`
)
SELECT
  UUID(),
  @daily_cleaning_category_id,
  '0.01测试支付',
  '用于小程序模拟支付链路测试，创建订单后可走 0.01 元模拟支付。',
  0.01,
  '次',
  1,
  0,
  5.00,
  NOW(3),
  NOW(3)
FROM DUAL
WHERE @daily_cleaning_category_id IS NOT NULL
  AND @mock_payment_service_count = 0;
