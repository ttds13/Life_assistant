const fs = require('node:fs')
const path = require('node:path')

const rootDir = path.resolve(__dirname, '..', '..')

function parseEnvValue(value) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function loadEnvFile() {
  const envPath = process.env.REAR_ENV_FILE || path.join(rootDir, '.env')
  if (!fs.existsSync(envPath)) return

  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const index = trimmed.indexOf('=')
    if (index === -1) continue

    const key = trimmed.slice(0, index).trim()
    const value = parseEnvValue(trimmed.slice(index + 1))
    if (!process.env[key]) process.env[key] = value
  }
}

function normalizePrefix(prefix) {
  if (!prefix) return '/api'
  const withLeadingSlash = prefix.startsWith('/') ? prefix : `/${prefix}`
  return withLeadingSlash.endsWith('/')
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash
}

loadEnvFile()

const port = Number.parseInt(process.env.PORT || '3000', 10)
const apiPrefix = normalizePrefix(process.env.API_PREFIX || '/api')
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`
const dataFile = path.resolve(rootDir, process.env.DATA_FILE || './data/db.json')

const config = Object.freeze({
  rootDir,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  host: process.env.HOST || '0.0.0.0',
  port,
  apiPrefix,
  publicBaseUrl,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  dataFile,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
  jwtExpiresIn: Number.parseInt(process.env.JWT_EXPIRES_IN || '604800', 10),
  wechatAppid: process.env.WECHAT_APPID || '',
  wechatSecret: process.env.WECHAT_SECRET || '',
})

module.exports = { config }
