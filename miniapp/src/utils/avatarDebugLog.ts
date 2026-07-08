const AVATAR_DEBUG_LOG_KEY = 'life-assistant:avatar-debug-logs'
const MAX_AVATAR_DEBUG_LOGS = 80

type AvatarDebugLogLevel = 'log' | 'error'

function readLogs() {
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

export function avatarDebugLog(label: string, payload?: unknown, level: AvatarDebugLogLevel = 'log') {
  const entry = {
    time: new Date().toISOString(),
    level,
    label,
    payload: normalizePayload(payload),
  }

  try {
    const logs = readLogs()
    logs.push(entry)
    uni.setStorageSync(AVATAR_DEBUG_LOG_KEY, logs.slice(-MAX_AVATAR_DEBUG_LOGS))
  }
  catch {}

  if (level === 'error')
    console.error(label, payload)
  else
    console.log(label, payload)
}

export function clearAvatarDebugLogs() {
  uni.removeStorageSync(AVATAR_DEBUG_LOG_KEY)
}

export { AVATAR_DEBUG_LOG_KEY }
