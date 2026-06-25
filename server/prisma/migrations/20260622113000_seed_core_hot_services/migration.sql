SET @daily_cleaning_category_id := (
  SELECT `id`
  FROM `service_categories`
  WHERE `name` = '日常保洁'
  ORDER BY `id` ASC
  LIMIT 1
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
WHERE @daily_cleaning_category_id IS NULL;

SET @daily_cleaning_category_id := (
  SELECT `id`
  FROM `service_categories`
  WHERE `name` = '日常保洁'
  ORDER BY `id` ASC
  LIMIT 1
);

SET @deep_cleaning_category_id := (
  SELECT `id`
  FROM `service_categories`
  WHERE `name` = '深度清洁'
  ORDER BY `id` ASC
  LIMIT 1
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
  '深度清洁',
  'i-carbon-tools',
  2,
  1,
  NOW(3),
  NOW(3)
FROM DUAL
WHERE @deep_cleaning_category_id IS NULL;

SET @deep_cleaning_category_id := (
  SELECT `id`
  FROM `service_categories`
  WHERE `name` = '深度清洁'
  ORDER BY `id` ASC
  LIMIT 1
);

SET @post_renovation_category_id := (
  SELECT `id`
  FROM `service_categories`
  WHERE `name` = '开荒保洁'
  ORDER BY `id` ASC
  LIMIT 1
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
  '开荒保洁',
  'i-carbon-clean',
  3,
  1,
  NOW(3),
  NOW(3)
FROM DUAL
WHERE @post_renovation_category_id IS NULL;

SET @post_renovation_category_id := (
  SELECT `id`
  FROM `service_categories`
  WHERE `name` = '开荒保洁'
  ORDER BY `id` ASC
  LIMIT 1
);

UPDATE `services`
SET
  `category_id` = @daily_cleaning_category_id,
  `description` = '适合小户型基础清洁，覆盖客厅、卧室、厨房台面和卫生间基础清洁。',
  `base_price` = 120,
  `min_price` = 120,
  `price_unit` = '次',
  `status` = 1,
  `sort_order` = 1,
  `deleted_at` = NULL,
  `updated_at` = NOW(3)
WHERE `name` = '日常保洁 2 小时'
  AND @daily_cleaning_category_id IS NOT NULL;

INSERT INTO `services` (
  `uuid`,
  `category_id`,
  `name`,
  `description`,
  `base_price`,
  `min_price`,
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
  '日常保洁 2 小时',
  '适合小户型基础清洁，覆盖客厅、卧室、厨房台面和卫生间基础清洁。',
  120,
  120,
  '次',
  1,
  1,
  5.00,
  NOW(3),
  NOW(3)
FROM DUAL
WHERE @daily_cleaning_category_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `services` WHERE `name` = '日常保洁 2 小时'
  );

UPDATE `services`
SET
  `category_id` = @daily_cleaning_category_id,
  `description` = '适合标准家庭日常维护清洁，包含地面、台面、厨卫基础清洁。',
  `base_price` = 170,
  `min_price` = 170,
  `price_unit` = '次',
  `status` = 1,
  `sort_order` = 2,
  `deleted_at` = NULL,
  `updated_at` = NOW(3)
WHERE `name` = '日常保洁 3 小时'
  AND @daily_cleaning_category_id IS NOT NULL;

INSERT INTO `services` (
  `uuid`,
  `category_id`,
  `name`,
  `description`,
  `base_price`,
  `min_price`,
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
  '日常保洁 3 小时',
  '适合标准家庭日常维护清洁，包含地面、台面、厨卫基础清洁。',
  170,
  170,
  '次',
  1,
  2,
  5.00,
  NOW(3),
  NOW(3)
FROM DUAL
WHERE @daily_cleaning_category_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `services` WHERE `name` = '日常保洁 3 小时'
  );

UPDATE `services`
SET
  `category_id` = @deep_cleaning_category_id,
  `description` = '针对厨卫、客厅等重点区域进行深度清洁。',
  `base_price` = 260,
  `min_price` = 260,
  `price_unit` = '次',
  `status` = 1,
  `sort_order` = 3,
  `deleted_at` = NULL,
  `updated_at` = NOW(3)
WHERE `name` = '深度清洁 4 小时'
  AND @deep_cleaning_category_id IS NOT NULL;

INSERT INTO `services` (
  `uuid`,
  `category_id`,
  `name`,
  `description`,
  `base_price`,
  `min_price`,
  `price_unit`,
  `status`,
  `sort_order`,
  `rating`,
  `created_at`,
  `updated_at`
)
SELECT
  UUID(),
  @deep_cleaning_category_id,
  '深度清洁 4 小时',
  '针对厨卫、客厅等重点区域进行深度清洁。',
  260,
  260,
  '次',
  1,
  3,
  5.00,
  NOW(3),
  NOW(3)
FROM DUAL
WHERE @deep_cleaning_category_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `services` WHERE `name` = '深度清洁 4 小时'
  );

UPDATE `services`
SET
  `category_id` = @post_renovation_category_id,
  `description` = '新房装修后首次清洁，清理灰尘、胶印和装修残留。',
  `base_price` = 399,
  `min_price` = 399,
  `price_unit` = '次',
  `status` = 1,
  `sort_order` = 4,
  `deleted_at` = NULL,
  `updated_at` = NOW(3)
WHERE `name` = '新居开荒保洁'
  AND @post_renovation_category_id IS NOT NULL;

INSERT INTO `services` (
  `uuid`,
  `category_id`,
  `name`,
  `description`,
  `base_price`,
  `min_price`,
  `price_unit`,
  `status`,
  `sort_order`,
  `rating`,
  `created_at`,
  `updated_at`
)
SELECT
  UUID(),
  @post_renovation_category_id,
  '新居开荒保洁',
  '新房装修后首次清洁，清理灰尘、胶印和装修残留。',
  399,
  399,
  '次',
  1,
  4,
  5.00,
  NOW(3),
  NOW(3)
FROM DUAL
WHERE @post_renovation_category_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `services` WHERE `name` = '新居开荒保洁'
  );
