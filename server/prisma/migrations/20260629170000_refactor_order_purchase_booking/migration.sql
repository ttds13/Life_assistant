ALTER TABLE `orders`
  ADD COLUMN `purchase_card_id` BIGINT NULL,
  ADD COLUMN `granted_user_member_card_id` BIGINT NULL,
  ADD COLUMN `linked_purchase_order_id` BIGINT NULL,
  ADD COLUMN `linked_booking_order_id` BIGINT NULL;

UPDATE `orders`
SET `purchase_card_id` = `member_card_id`,
    `member_card_id` = NULL
WHERE `order_type` = 'member_card_purchase'
  AND `purchase_card_id` IS NULL;

UPDATE `orders`
SET `order_type` = 'service_booking'
WHERE `order_type` IN ('service', 'member_card_booking');

ALTER TABLE `orders`
  MODIFY COLUMN `order_type` VARCHAR(32) NOT NULL DEFAULT 'service_booking';

CREATE INDEX `orders_order_type_idx` ON `orders`(`order_type`);
CREATE INDEX `orders_order_type_status_idx` ON `orders`(`order_type`, `status`);
CREATE INDEX `orders_purchase_card_id_idx` ON `orders`(`purchase_card_id`);
CREATE INDEX `orders_granted_user_member_card_id_idx` ON `orders`(`granted_user_member_card_id`);
CREATE INDEX `orders_linked_purchase_order_id_idx` ON `orders`(`linked_purchase_order_id`);
CREATE INDEX `orders_linked_booking_order_id_idx` ON `orders`(`linked_booking_order_id`);
