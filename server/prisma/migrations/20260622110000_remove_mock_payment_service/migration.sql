UPDATE `services`
SET
  `status` = 0,
  `deleted_at` = COALESCE(`deleted_at`, NOW(3)),
  `updated_at` = NOW(3)
WHERE `name` = '0.01测试支付';
