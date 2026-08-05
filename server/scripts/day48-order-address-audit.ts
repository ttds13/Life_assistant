import { PrismaClient } from '@prisma/client'

type AuditPhase = 'pre' | 'post'
type AuditSeverity = 'error' | 'info'

interface AuditCheck {
  name: string
  severity: AuditSeverity
  passed: boolean
  count: number
  message: string
  sampleIds?: string[]
}

interface CountRow {
  count: bigint | number | string
}

interface IdRow {
  id: bigint | number | string
}

const prisma = new PrismaClient()
const SERVICE_ORDER_TYPES = "'service_booking', 'consultation'"

function requestedPhase() {
  const value = process.argv.find(item => item.startsWith('--phase='))?.split('=')[1]
  if (!value || value === 'auto') return 'auto'
  if (value === 'pre' || value === 'post') return value
  throw new Error('phase must be auto, pre, or post')
}

function toCount(value: CountRow['count'] | undefined) {
  const count = Number(value || 0)
  if (!Number.isSafeInteger(count) || count < 0) throw new Error(`invalid count: ${String(value)}`)
  return count
}

async function count(sql: string) {
  const rows = await prisma.$queryRawUnsafe<CountRow[]>(sql)
  return toCount(rows[0]?.count)
}

async function sampleIds(sql: string) {
  const rows = await prisma.$queryRawUnsafe<IdRow[]>(sql)
  return rows.map(row => String(row.id))
}

async function hasTable(tableName: string) {
  return (await count(`
    SELECT COUNT(*) AS count
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = '${tableName}'
  `)) === 1
}

async function hasColumn(tableName: string, columnName: string) {
  return (await count(`
    SELECT COUNT(*) AS count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = '${tableName}'
      AND COLUMN_NAME = '${columnName}'
  `)) === 1
}

function addCheck(
  checks: AuditCheck[],
  name: string,
  issueCount: number,
  message: string,
  sample?: string[],
  severity: AuditSeverity = 'error',
) {
  checks.push({
    name,
    severity,
    passed: issueCount === 0,
    count: issueCount,
    message,
    ...(sample?.length ? { sampleIds: sample } : {}),
  })
}

async function addDataCheck(
  checks: AuditCheck[],
  name: string,
  fromAndWhere: string,
  message: string,
  idExpression = 'o.id',
) {
  const issueCount = await count(`SELECT COUNT(*) AS count ${fromAndWhere}`)
  const sample = issueCount
    ? await sampleIds(`SELECT ${idExpression} AS id ${fromAndWhere} ORDER BY ${idExpression} ASC LIMIT 20`)
    : undefined
  addCheck(checks, name, issueCount, message, sample)
}

async function detectPhase(): Promise<AuditPhase> {
  const requested = requestedPhase()
  if (requested !== 'auto') return requested
  return await hasColumn('orders', 'address_snapshot') ? 'pre' : 'post'
}

async function runPreMigrationAudit() {
  const checks: AuditCheck[] = []
  const requiredTables = ['orders', 'addresses']
  for (const table of requiredTables) {
    addCheck(checks, `schema.table.${table}`, await hasTable(table) ? 0 : 1, `required table ${table} must exist`)
  }
  const hasLegacyColumn = await hasColumn('orders', 'address_snapshot')
  addCheck(checks, 'schema.orders.address_snapshot', hasLegacyColumn ? 0 : 1, 'legacy address_snapshot must exist before migration')
  if (checks.some(check => check.severity === 'error' && !check.passed)) return checks

  await addDataCheck(
    checks,
    'addresses.content.valid',
    `FROM addresses a
     WHERE TRIM(a.contact_name) = ''
       OR TRIM(a.contact_phone) = ''
       OR TRIM(a.detail_address) = ''
       OR TRIM(a.formatted_address) = ''`,
    'address-book contact and text fields must not be blank',
    'a.id',
  )
  await addDataCheck(
    checks,
    'addresses.coordinates.valid',
    `FROM addresses a
     WHERE (a.latitude IS NULL) <> (a.longitude IS NULL)
       OR a.latitude NOT BETWEEN -90 AND 90
       OR a.longitude NOT BETWEEN -180 AND 180
       OR (a.latitude IS NOT NULL AND NULLIF(TRIM(a.coordinate_type), '') IS NULL)`,
    'address-book coordinates must satisfy pair, range, and type rules',
    'a.id',
  )
  await addDataCheck(
    checks,
    'legacy.snapshot.required',
    `FROM orders o
     WHERE o.order_type IN (${SERVICE_ORDER_TYPES})
       AND o.address_snapshot IS NULL`,
    'every service order needs a legacy snapshot before migration',
  )
  await addDataCheck(
    checks,
    'legacy.contact_name.required',
    `FROM orders o
     WHERE o.order_type IN (${SERVICE_ORDER_TYPES})
       AND NULLIF(TRIM(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.address_snapshot, '$.contactName')), 'null')), '') IS NULL`,
    'service-order snapshots need a contact name',
  )
  await addDataCheck(
    checks,
    'legacy.contact_phone.required',
    `FROM orders o
     WHERE o.order_type IN (${SERVICE_ORDER_TYPES})
       AND NULLIF(TRIM(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.address_snapshot, '$.contactPhone')), 'null')), '') IS NULL`,
    'service-order snapshots need a contact phone',
  )
  await addDataCheck(
    checks,
    'legacy.detail_address.required',
    `FROM orders o
     WHERE o.order_type IN (${SERVICE_ORDER_TYPES})
       AND COALESCE(
         NULLIF(TRIM(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.address_snapshot, '$.detailAddress')), 'null')), ''),
         NULLIF(TRIM(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.address_snapshot, '$.address')), 'null')), '')
       ) IS NULL`,
    'service-order snapshots need a detail address',
  )
  await addDataCheck(
    checks,
    'legacy.formatted_address.required',
    `FROM orders o
     WHERE o.order_type IN (${SERVICE_ORDER_TYPES})
       AND COALESCE(
         NULLIF(TRIM(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.address_snapshot, '$.formattedAddress')), 'null')), ''),
         NULLIF(TRIM(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.address_snapshot, '$.detailAddress')), 'null')), ''),
         NULLIF(TRIM(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.address_snapshot, '$.address')), 'null')), '')
       ) IS NULL`,
    'service-order snapshots need a formatted or detail address',
  )
  const latitude = "NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.address_snapshot, '$.latitude')), 'null'), '')"
  const longitude = "NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.address_snapshot, '$.longitude')), 'null'), '')"
  await addDataCheck(
    checks,
    'legacy.coordinate_pair.valid',
    `FROM orders o
     WHERE o.order_type IN (${SERVICE_ORDER_TYPES})
       AND ((${latitude} IS NULL) <> (${longitude} IS NULL))`,
    'latitude and longitude must both be present or both be absent',
  )
  await addDataCheck(
    checks,
    'legacy.coordinate_values.valid',
    `FROM orders o
     WHERE o.order_type IN (${SERVICE_ORDER_TYPES})
       AND ${latitude} IS NOT NULL
       AND (
         ${latitude} NOT REGEXP '^-?[0-9]+([.][0-9]+)?$'
         OR ${longitude} NOT REGEXP '^-?[0-9]+([.][0-9]+)?$'
         OR CAST(${latitude} AS DECIMAL(10, 7)) NOT BETWEEN -90 AND 90
         OR CAST(${longitude} AS DECIMAL(10, 7)) NOT BETWEEN -180 AND 180
       )`,
    'coordinates must be numeric and in geographic range',
  )
  await addDataCheck(
    checks,
    'legacy.coordinate_type.required',
    `FROM orders o
     WHERE o.order_type IN (${SERVICE_ORDER_TYPES})
       AND ${latitude} IS NOT NULL
       AND NULLIF(TRIM(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.address_snapshot, '$.coordinateType')), 'null')), '') IS NULL`,
    'coordinateType is required whenever coordinates exist',
  )
  await addDataCheck(
    checks,
    'legacy.source_address_id.valid',
    `FROM orders o
     WHERE o.order_type IN (${SERVICE_ORDER_TYPES})
       AND NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.address_snapshot, '$.addressId')), 'null'), '') IS NOT NULL
       AND JSON_UNQUOTE(JSON_EXTRACT(o.address_snapshot, '$.addressId')) NOT REGEXP '^[1-9][0-9]*$'`,
    'source address IDs must be positive integers when present',
  )
  await addDataCheck(
    checks,
    'legacy.source_address_owner.valid',
    `FROM orders o
     WHERE o.order_type IN (${SERVICE_ORDER_TYPES})
       AND JSON_UNQUOTE(JSON_EXTRACT(o.address_snapshot, '$.addressId')) REGEXP '^[1-9][0-9]*$'
       AND NOT EXISTS (
         SELECT 1
         FROM addresses a
         WHERE a.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(o.address_snapshot, '$.addressId')) AS UNSIGNED)
           AND a.owner_type = 'user'
           AND a.owner_id = o.user_id
           AND a.address_type = 'service'
       )`,
    'linked source addresses must belong to the order user and service address book',
  )
  return checks
}

async function runPostMigrationAudit() {
  const checks: AuditCheck[] = []
  const requiredTables = ['orders', 'addresses', 'address_revisions', 'order_addresses', 'order_address_revisions']
  for (const table of requiredTables) {
    addCheck(checks, `schema.table.${table}`, await hasTable(table) ? 0 : 1, `required table ${table} must exist`)
  }
  addCheck(
    checks,
    'schema.legacy_column_removed',
    await hasColumn('orders', 'address_snapshot') ? 1 : 0,
    'orders.address_snapshot must be removed after migration',
  )
  addCheck(
    checks,
    'schema.address_version',
    await hasColumn('addresses', 'version') ? 0 : 1,
    'addresses.version must exist after migration',
  )
  if (checks.some(check => check.severity === 'error' && !check.passed)) return checks

  const requiredConstraints = [
    'addresses_version_check',
    'addresses_contact_name_check',
    'addresses_contact_phone_check',
    'addresses_detail_address_check',
    'addresses_formatted_address_check',
    'addresses_coordinate_pair_check',
    'addresses_latitude_range_check',
    'addresses_longitude_range_check',
    'addresses_coordinate_type_check',
    'address_revisions_address_id_fkey',
    'address_revisions_version_check',
    'order_addresses_order_id_fkey',
    'order_addresses_source_address_id_fkey',
    'order_addresses_version_check',
    'order_addresses_contact_name_check',
    'order_addresses_contact_phone_check',
    'order_addresses_detail_address_check',
    'order_addresses_formatted_address_check',
    'order_addresses_coordinate_pair_check',
    'order_addresses_latitude_range_check',
    'order_addresses_longitude_range_check',
    'order_addresses_coordinate_type_check',
    'order_address_revisions_order_address_id_fkey',
    'order_address_revisions_version_check',
  ]
  for (const constraint of requiredConstraints) {
    const exists = await count(`
      SELECT COUNT(*) AS count
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND CONSTRAINT_NAME = '${constraint}'
    `)
    addCheck(checks, `schema.constraint.${constraint}`, exists === 1 ? 0 : 1, `constraint ${constraint} must exist`)
  }

  await addDataCheck(
    checks,
    'orders.service_address.required',
    `FROM orders o
     LEFT JOIN order_addresses oa ON oa.order_id = o.id
     WHERE o.order_type IN (${SERVICE_ORDER_TYPES})
       AND oa.id IS NULL`,
    'every service order must have exactly one current order address',
  )
  await addDataCheck(
    checks,
    'orders.non_service_address.absent',
    `FROM orders o
     INNER JOIN order_addresses oa ON oa.order_id = o.id
     WHERE o.order_type NOT IN (${SERVICE_ORDER_TYPES})`,
    'non-service orders must not have an order address',
  )
  await addDataCheck(
    checks,
    'orders.address_content.valid',
    `FROM orders o
     INNER JOIN order_addresses oa ON oa.order_id = o.id
     WHERE TRIM(oa.contact_name) = ''
       OR TRIM(oa.contact_phone) = ''
       OR TRIM(oa.detail_address) = ''
       OR TRIM(oa.formatted_address) = ''`,
    'current order address contact and text fields must not be blank',
  )
  await addDataCheck(
    checks,
    'orders.coordinates.valid',
    `FROM orders o
     INNER JOIN order_addresses oa ON oa.order_id = o.id
     WHERE (oa.latitude IS NULL) <> (oa.longitude IS NULL)
       OR oa.latitude NOT BETWEEN -90 AND 90
       OR oa.longitude NOT BETWEEN -180 AND 180
       OR (oa.latitude IS NOT NULL AND NULLIF(TRIM(oa.coordinate_type), '') IS NULL)`,
    'current order address coordinates must satisfy pair, range, and type rules',
  )
  await addDataCheck(
    checks,
    'orders.source_address_owner.valid',
    `FROM orders o
     INNER JOIN order_addresses oa ON oa.order_id = o.id
     INNER JOIN addresses a ON a.id = oa.source_address_id
     WHERE a.owner_type <> 'user'
       OR a.owner_id <> o.user_id
       OR a.address_type <> 'service'`,
    'linked source addresses must belong to the order user and service address book',
  )
  await addDataCheck(
    checks,
    'orders.current_revision.exists',
    `FROM orders o
     INNER JOIN order_addresses oa ON oa.order_id = o.id
     LEFT JOIN order_address_revisions r
       ON r.order_address_id = oa.id AND r.version = oa.version
     WHERE r.id IS NULL`,
    'every current order-address version must have an immutable revision',
  )
  await addDataCheck(
    checks,
    'orders.current_revision.matches',
    `FROM orders o
     INNER JOIN order_addresses oa ON oa.order_id = o.id
     INNER JOIN order_address_revisions r
       ON r.order_address_id = oa.id AND r.version = oa.version
     WHERE CAST(JSON_UNQUOTE(JSON_EXTRACT(r.snapshot, '$.version')) AS UNSIGNED) <> oa.version
       OR JSON_UNQUOTE(JSON_EXTRACT(r.snapshot, '$.contactName')) <> oa.contact_name
       OR JSON_UNQUOTE(JSON_EXTRACT(r.snapshot, '$.contactPhone')) <> oa.contact_phone
       OR JSON_UNQUOTE(JSON_EXTRACT(r.snapshot, '$.detailAddress')) <> oa.detail_address
       OR JSON_UNQUOTE(JSON_EXTRACT(r.snapshot, '$.formattedAddress')) <> oa.formatted_address
       OR JSON_UNQUOTE(JSON_EXTRACT(r.snapshot, '$.source')) <> oa.source`,
    'the current order-address revision must match the current relational row',
  )
  await addDataCheck(
    checks,
    'orders.revision_chain.contiguous',
    `FROM (
       SELECT oa.order_id AS id
       FROM order_addresses oa
       LEFT JOIN order_address_revisions r ON r.order_address_id = oa.id
       GROUP BY oa.id, oa.order_id, oa.version
       HAVING MIN(r.version) <> 1
         OR MAX(r.version) <> oa.version
         OR COUNT(r.id) <> oa.version
     ) broken`,
    'order-address revisions must form a contiguous chain from v1 to the current version',
    'broken.id',
  )
  await addDataCheck(
    checks,
    'addresses.current_revision.exists',
    `FROM addresses a
     LEFT JOIN address_revisions r
       ON r.address_id = a.id AND r.version = a.version
     WHERE r.id IS NULL`,
    'every current address-book version must have an immutable revision',
    'a.id',
  )
  await addDataCheck(
    checks,
    'addresses.current_revision.matches',
    `FROM addresses a
     INNER JOIN address_revisions r
       ON r.address_id = a.id AND r.version = a.version
     WHERE CAST(JSON_UNQUOTE(JSON_EXTRACT(r.snapshot, '$.version')) AS UNSIGNED) <> a.version
       OR JSON_UNQUOTE(JSON_EXTRACT(r.snapshot, '$.contactName')) <> a.contact_name
       OR JSON_UNQUOTE(JSON_EXTRACT(r.snapshot, '$.contactPhone')) <> a.contact_phone
       OR JSON_UNQUOTE(JSON_EXTRACT(r.snapshot, '$.detailAddress')) <> a.detail_address
       OR JSON_UNQUOTE(JSON_EXTRACT(r.snapshot, '$.formattedAddress')) <> a.formatted_address
       OR JSON_UNQUOTE(JSON_EXTRACT(r.snapshot, '$.source')) <> a.source
       OR JSON_UNQUOTE(JSON_EXTRACT(r.snapshot, '$.isDefault')) <> IF(a.is_default, 'true', 'false')`,
    'the current address-book revision must match the current relational row',
    'a.id',
  )
  await addDataCheck(
    checks,
    'addresses.content.valid',
    `FROM addresses a
     WHERE TRIM(a.contact_name) = ''
       OR TRIM(a.contact_phone) = ''
       OR TRIM(a.detail_address) = ''
       OR TRIM(a.formatted_address) = ''`,
    'address-book contact and text fields must not be blank',
    'a.id',
  )
  await addDataCheck(
    checks,
    'addresses.coordinates.valid',
    `FROM addresses a
     WHERE (a.latitude IS NULL) <> (a.longitude IS NULL)
       OR a.latitude NOT BETWEEN -90 AND 90
       OR a.longitude NOT BETWEEN -180 AND 180
       OR (a.latitude IS NOT NULL AND NULLIF(TRIM(a.coordinate_type), '') IS NULL)`,
    'address-book coordinates must satisfy pair, range, and type rules',
    'a.id',
  )
  await addDataCheck(
    checks,
    'addresses.revision_chain.contiguous',
    `FROM (
       SELECT a.id
       FROM addresses a
       LEFT JOIN address_revisions r ON r.address_id = a.id
       GROUP BY a.id, a.version
       HAVING MIN(r.version) <> 1
         OR MAX(r.version) <> a.version
         OR COUNT(r.id) <> a.version
     ) broken`,
    'address-book revisions must form a contiguous chain from v1 to the current version',
    'broken.id',
  )
  return checks
}

async function main() {
  await prisma.$queryRaw`SELECT 1`
  const phase = await detectPhase()
  const checks = phase === 'pre' ? await runPreMigrationAudit() : await runPostMigrationAudit()
  const failed = checks.filter(check => check.severity === 'error' && !check.passed)
  const serviceOrders = await count(`SELECT COUNT(*) AS count FROM orders WHERE order_type IN (${SERVICE_ORDER_TYPES})`)
  const report = {
    audit: 'day48-order-address-system',
    phase,
    database: 'connected',
    serviceOrders,
    status: failed.length ? 'failed' : 'passed',
    failedChecks: failed.length,
    checks,
  }
  console.log(JSON.stringify(report, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2))
  if (failed.length) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
