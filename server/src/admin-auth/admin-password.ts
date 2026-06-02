import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const KEY_LENGTH = 32
const HASH_PREFIX = 'scrypt'

export async function hashAdminPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url')
  const derivedKey = await scrypt(password, salt, KEY_LENGTH) as Buffer
  return `${HASH_PREFIX}:${salt}:${derivedKey.toString('base64url')}`
}

export async function verifyAdminPassword(password: string, passwordHash: string): Promise<boolean> {
  const [prefix, salt, storedHash] = passwordHash.split(':')
  if (prefix !== HASH_PREFIX || !salt || !storedHash) return false

  const stored = Buffer.from(storedHash, 'base64url')
  const derivedKey = await scrypt(password, salt, stored.length) as Buffer
  if (stored.length !== derivedKey.length) return false

  return timingSafeEqual(stored, derivedKey)
}

export function assertStrongAdminPassword(username: string, password: string) {
  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters')
  }
  if (password === username) {
    throw new Error('ADMIN_PASSWORD must not be the same as ADMIN_USERNAME')
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new Error('ADMIN_PASSWORD must include uppercase, lowercase and number characters')
  }
}
