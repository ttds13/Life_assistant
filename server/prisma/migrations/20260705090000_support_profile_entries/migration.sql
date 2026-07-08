ALTER TABLE `staff`
  ADD COLUMN `application_note` TEXT NULL,
  ADD COLUMN `application_images` JSON NULL;

CREATE TABLE `feedbacks` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `feedback_no` VARCHAR(32) NOT NULL,
  `user_id` BIGINT NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `content` TEXT NOT NULL,
  `contact_phone` VARCHAR(20) NULL,
  `images` JSON NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'open',
  `reply` TEXT NULL,
  `handled_by` BIGINT NULL,
  `handled_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `feedbacks_feedback_no_key`(`feedback_no`),
  INDEX `feedbacks_user_id_idx`(`user_id`),
  INDEX `feedbacks_status_idx`(`status`),
  INDEX `feedbacks_type_idx`(`type`),

  CONSTRAINT `feedbacks_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
