ALTER TABLE `services` ADD COLUMN `code` VARCHAR(64) NULL;

UPDATE `services`
SET `code` = CONCAT('svc_', `id`)
WHERE `code` IS NULL OR `code` = '';

ALTER TABLE `services` MODIFY `code` VARCHAR(64) NOT NULL;

CREATE UNIQUE INDEX `services_code_key` ON `services`(`code`);
