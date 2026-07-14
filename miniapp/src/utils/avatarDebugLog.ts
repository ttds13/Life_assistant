import { ref } from 'vue'

const AVATAR_DEBUG_LOG_KEY = 'life-assistant:avatar-debug-logs'
const MAX_AVATAR_DEBUG_LOGS = 80

export type AvatarDebugLogLevel = 'log' | 'error'

export interface AvatarDebugLogEntry {
  time: string
  level: AvatarDebugLogLevel
  label: string
  payload?: unknown
  message: string
}

export const avatarDebugLogs = ref<AvatarDebugLogEntry[]>([])

function readLogs(): AvatarDebugLogEntry[] {
  try {
    const raw = uni.getStorageSync(AVATAR_DEBUG_LOG_KEY)
    if (Array.isArray(raw))
      return raw
    if (typeof raw === 'string' && raw)
      return JSON.parse(raw)
  }
  catch {
    return []
  }
  return []
}

function normalizePayload(payload: unknown) {
  if (payload === undefined)
    return undefined

  if (payload instanceof Error) {
    return {
      name: payload.name,
      message: payload.message,
      stack: payload.stack,
    }
  }
  try {
    return JSON.parse(JSON.stringify(payload))
  }
  catch {
    return String(payload)
  }
}

function stringifyPayload(payload: unknown) {
  if (payload === undefined)
    return ''
  if (typeof payload === 'string')
    return payload
  try {
    return JSON.stringify(payload)
  }
  catch {
    return String(payload)
  }
}

function syncDebugLogs(logs = readLogs()) {
  avatarDebugLogs.value = logs.slice(-MAX_AVATAR_DEBUG_LOGS)
}

export function refreshAvatarDebugLogs() {
  syncDebugLogs()
}

export function avatarDebugLog(label: string, payload?: unknown, level: AvatarDebugLogLevel = 'log') {
  const normalizedPayload = normalizePayload(payload)
  const entry = {
    time: new Date().toISOString(),
    level,
    label,
    payload: normalizedPayload,
    message: stringifyPayload(normalizedPayload),
  }

  let nextLogs = [...avatarDebugLogs.value, entry].slice(-MAX_AVATAR_DEBUG_LOGS)
  syncDebugLogs(nextLogs)

  try {
    const logs = readLogs()
    logs.push(entry)
    nextLogs = logs.slice(-MAX_AVATAR_DEBUG_LOGS)
    uni.setStorageSync(AVATAR_DEBUG_LOG_KEY, nextLogs)
    syncDebugLogs(nextLogs)
  }
  catch {}

  if (level === 'error')
    console.error(label, payload)
  else
    console.log(label, payload)
}

export function clearAvatarDebugLogs() {
  uni.removeStorageSync(AVATAR_DEBUG_LOG_KEY)
  avatarDebugLogs.value = []
}

export function formatAvatarDebugLog(entry: AvatarDebugLogEntry) {
  const time = entry.time?.slice(11, 19) || ''
  const level = entry.level === 'error' ? 'ERROR' : 'LOG'
  const message = entry.message || stringifyPayload(entry.payload)
  return message
    ? `${time} [${level}] ${entry.label}: ${message}`
    : `${time} [${level}] ${entry.label}`
}

export function logWechatProfileEnvironment(scene: string) {
  try {
    const info = uni.getSystemInfoSync() as any
    avatarDebugLog(`${scene} system info`, {
      SDKVersion: info.SDKVersion,
      version: info.version,
      platform: info.platform,
      brand: info.brand,
      model: info.model,
      system: info.system,
      appName: info.appName,
    })
  }
  catch (err) {
    avatarDebugLog(`${scene} system info failed`, err, 'error')
  }
}

export { AVATAR_DEBUG_LOG_KEY }
