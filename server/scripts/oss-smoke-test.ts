import OSS from 'ali-oss'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

type EnvMap = Record<string, string>

function loadEnvFile(filename: string) {
  const env: EnvMap = {}
  if (!fs.existsSync(filename)) return env

  for (const line of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index <= 0) continue
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    env[key] = value
  }
  return env
}

function requireEnv(env: EnvMap, key: string) {
  const value = env[key] || process.env[key]
  if (!value) throw new Error(`${key} is required`)
  return value
}

async function main() {
  const envPath = process.argv[2] || path.join(process.cwd(), '.env.production')
  const env = loadEnvFile(envPath)
  const bucket = requireEnv(env, 'OSS_BUCKET')
  const publicBaseUrl = (env.OSS_PUBLIC_BASE_URL || `https://${bucket}.oss-cn-shenzhen.aliyuncs.com`).replace(/\/+$/, '')
  const prefix = (env.OSS_UPLOAD_PREFIX || 'life-assitant/prod').replace(/^\/+|\/+$/g, '')
  const objectKey = `${prefix}/smoke-test/local/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.png`

  const client = new OSS({
    region: env.OSS_REGION || 'oss-cn-shenzhen',
    endpoint: env.OSS_ENDPOINT || 'https://oss-cn-shenzhen.aliyuncs.com',
    bucket,
    accessKeyId: requireEnv(env, 'OSS_ACCESS_KEY_ID'),
    accessKeySecret: requireEnv(env, 'OSS_ACCESS_KEY_SECRET'),
    authorizationV4: (env.OSS_SIGNATURE_VERSION || 'v4') === 'v4',
  })

  const buffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  )
  const expectedSha256 = crypto.createHash('sha256').update(buffer).digest('hex')

  await client.put(objectKey, buffer, {
    headers: {
      'Content-Type': 'image/png',
      'x-oss-forbid-overwrite': 'true',
    },
  })

  const fixedUrl = `${publicBaseUrl}/${encodeURI(objectKey).replace(/%2F/g, '/')}`
  const signedUrl = client.signatureUrl(objectKey, {
    expires: Number(env.OSS_SIGNED_URL_EXPIRES_SECONDS || 900),
    method: 'GET',
  })

  const response = await fetch(signedUrl)
  if (!response.ok) {
    throw new Error(`signed download failed: ${response.status} ${response.statusText}`)
  }
  const downloaded = Buffer.from(await response.arrayBuffer())
  const actualSha256 = crypto.createHash('sha256').update(downloaded).digest('hex')
  if (actualSha256 !== expectedSha256) {
    throw new Error('downloaded object hash mismatch')
  }

  console.log(JSON.stringify({
    ok: true,
    bucket,
    objectKey,
    fixedUrl,
    signedUrlHost: new URL(signedUrl).host,
    bytes: downloaded.length,
    sha256: actualSha256,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
