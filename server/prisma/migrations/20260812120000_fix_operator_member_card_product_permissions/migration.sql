-- Allow operator admins to create and edit member-card products.
UPDATE `roles`
SET `permissions` = JSON_ARRAY_APPEND(
  COALESCE(`permissions`, JSON_ARRAY()),
  '$',
  'member-card:create'
)
WHERE `name` = 'operator'
  AND JSON_CONTAINS(COALESCE(`permissions`, JSON_ARRAY()), JSON_QUOTE('member-card:create')) = 0;

UPDATE `roles`
SET `permissions` = JSON_ARRAY_APPEND(
  COALESCE(`permissions`, JSON_ARRAY()),
  '$',
  'member-card:update'
)
WHERE `name` = 'operator'
  AND JSON_CONTAINS(COALESCE(`permissions`, JSON_ARRAY()), JSON_QUOTE('member-card:update')) = 0;
