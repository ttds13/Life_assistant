-- AlterTable
ALTER TABLE `staff` ADD COLUMN `user_id` BIGINT NULL;

-- Backfill staff roles previously created from the user page.
UPDATE `staff` AS s
INNER JOIN `users` AS u ON s.`uuid` = CONCAT('dev-staff-user-', u.`id`)
SET s.`user_id` = u.`id`
WHERE s.`user_id` IS NULL;

-- Link active staff to an existing active user when the phone maps unambiguously.
UPDATE `staff` AS s
INNER JOIN (
    SELECT
        s2.`id` AS staff_id,
        MIN(u.`id`) AS user_id
    FROM `staff` AS s2
    INNER JOIN (
        SELECT `phone`
        FROM `staff`
        WHERE `user_id` IS NULL AND `deleted_at` IS NULL AND `phone` IS NOT NULL AND `phone` <> ''
        GROUP BY `phone`
        HAVING COUNT(*) = 1
    ) AS unique_staff_phone ON unique_staff_phone.`phone` = s2.`phone`
    INNER JOIN (
        SELECT `phone`
        FROM `users`
        WHERE `deleted_at` IS NULL AND `phone` IS NOT NULL AND `phone` <> ''
        GROUP BY `phone`
        HAVING COUNT(*) = 1
    ) AS unique_user_phone ON unique_user_phone.`phone` = s2.`phone`
    INNER JOIN `users` AS u
        ON u.`phone` = s2.`phone`
        AND u.`deleted_at` IS NULL
    LEFT JOIN `staff` AS linked
        ON linked.`user_id` = u.`id`
    WHERE
        s2.`user_id` IS NULL
        AND s2.`deleted_at` IS NULL
        AND s2.`phone` IS NOT NULL
        AND s2.`phone` <> ''
        AND linked.`id` IS NULL
    GROUP BY s2.`id`
    HAVING COUNT(DISTINCT u.`id`) = 1
) AS matched ON matched.staff_id = s.`id`
SET s.`user_id` = matched.user_id
WHERE s.`user_id` IS NULL;

-- Create a user identity for every remaining active staff profile.
INSERT INTO `users` (
    `uuid`,
    `phone`,
    `nickname`,
    `avatar_url`,
    `gender`,
    `status`,
    `city_code`,
    `created_at`,
    `updated_at`
)
SELECT
    CONCAT('staff-user-', s.`id`),
    s.`phone`,
    s.`name`,
    s.`avatar_url`,
    0,
    1,
    s.`city_code`,
    s.`created_at`,
    s.`updated_at`
FROM `staff` AS s
LEFT JOIN `users` AS u ON u.`uuid` = CONCAT('staff-user-', s.`id`)
WHERE s.`user_id` IS NULL AND s.`deleted_at` IS NULL AND u.`id` IS NULL;

UPDATE `staff` AS s
INNER JOIN `users` AS u ON u.`uuid` = CONCAT('staff-user-', s.`id`)
SET s.`user_id` = u.`id`
WHERE s.`user_id` IS NULL AND s.`deleted_at` IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX `staff_user_id_key` ON `staff`(`user_id`);

-- AddForeignKey
ALTER TABLE `staff` ADD CONSTRAINT `staff_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
