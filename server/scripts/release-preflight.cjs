const fs = require('node:fs')
const path = require('node:path')

const env = process.env
const failures = []

function requireValue(name) {
  if (!env[name]?.trim()) failures.push(`${name} is required`)
}

function requireSecret(name) {
  const value = env[name]?.trim()
  if (!value) {
    failures.push(`${name} is required`)
    return
  }
  if (value.length < 32) failures.push(`${name} must be at least 32 characters`)
}

function requireHttps(name) {
  const value = env[name]?.trim()
  if (!value?.startsWith('https://')) failures.push(`${name} must be an https URL`)
}

function requireReadableFile(name) {
  const file = env[name]?.trim()
  if (!file) {
    failures.push(`${name} is required`)
    return
  }
  const target = path.isAbsolute(file) ? file : path.join(process.cwd(), file)
  try {
    if (!fs.statSync(target).isFile()) failures.push(`${name} must point to a file`)
  }
  catch {
    failures.push(`${name} does not exist or is not readable`)
  }
}

function requireFileOrInline(pathName, inlineName) {
  if (env[inlineName]?.trim()) return
  requireReadableFile(pathName)
}

function paymentEnabled() {
  return (env.PAYMENT_PROVIDER || 'wechat') === 'wechat'
    || (env.REFUND_PROVIDER || '') === 'wechat'
    || (env.WITHDRAW_PROVIDER || '') === 'wechat'
}

if (env.NODE_ENV !== 'production') failures.push('NODE_ENV must be production')
if (env.SEED_ON_START !== 'false') failures.push('SEED_ON_START must be false in production')

requireSecret('JWT_SECRET')
if (env.JWT_SECRET === 'dev-secret-key-change-in-production' || env.JWT_SECRET === 'replace-with-strong-random-secret') {
  failures.push('JWT_SECRET must not use a placeholder value')
}
requireSecret('REFRESH_TOKEN_PEPPER')

const mapProvider = env.MAP_PROVIDER || 'tencent'
if (mapProvider === 'tencent') requireValue('TENCENT_MAP_KEY')
else if (mapProvider === 'amap') requireValue('AMAP_MAP_KEY')
else failures.push('MAP_PROVIDER must be tencent or amap')

if (paymentEnabled()) {
  if (!env.WECHAT_PAY_APPID?.trim() && !env.WECHAT_APPID?.trim()) failures.push('WECHAT_PAY_APPID or WECHAT_APPID is required')
  requireValue('WECHAT_PAY_MCH_ID')
  requireValue('WECHAT_PAY_SERIAL_NO')
  const apiV3Key = env.WECHAT_PAY_API_V3_KEY?.trim() || ''
  if (apiV3Key.length !== 32) failures.push('WECHAT_PAY_API_V3_KEY must be 32 characters')
  if (env.WECHAT_PAY_NOTIFY_URL?.trim()) requireHttps('WECHAT_PAY_NOTIFY_URL')
  else if (!env.PUBLIC_BASE_URL?.trim()?.startsWith('https://')) failures.push('WECHAT_PAY_NOTIFY_URL or an https PUBLIC_BASE_URL is required')
  requireFileOrInline('WECHAT_PAY_PRIVATE_KEY_PATH', 'WECHAT_PAY_PRIVATE_KEY')
  requireFileOrInline('WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH', 'WECHAT_PAY_PLATFORM_PUBLIC_KEY')
}

if (env.WITHDRAW_PROVIDER !== 'wechat') {
  failures.push('WITHDRAW_PROVIDER must be explicitly set to wechat for production payouts')
}
else {
  requireValue('WECHAT_TRANSFER_SCENE_ID')
}

if (failures.length > 0) {
  console.error('Production release preflight failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Production release preflight passed')
