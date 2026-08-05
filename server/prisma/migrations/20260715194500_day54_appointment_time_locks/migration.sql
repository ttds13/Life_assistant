-- Day54: platform-level appointment time locks for new service bookings.

CREATE TABLE `appointment_time_locks` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `lock_date` DATE NOT NULL,
  `time_slot` VARCHAR(16) NOT NULL,
  `reason` VARCHAR(256) NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'active',
  `created_by` BIGINT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `appointment_time_locks_lock_date_time_slot_key` (`lock_date`, `time_slot`),
  INDEX `appointment_time_locks_lock_date_status_idx` (`lock_date`, `status`),
  INDEX `appointment_time_locks_created_by_idx` (`created_by`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
