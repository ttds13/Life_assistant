import type { DevStaffSession } from '@/api/types/auth'
import { createDevStaffSession } from '@/api/auth'
import { getStoredDevStaffSession, saveDevStaffSession } from '@/utils/devStaffStorage'

let pendingSession: Promise<DevStaffSession> | null = null

export async function ensureDevStaffSession() {
  const stored = getStoredDevStaffSession()
  if (stored)
    return stored

  if (!pendingSession) {
    pendingSession = createDevStaffSession()
      .then((session) => {
        saveDevStaffSession(session)
        return session
      })
      .finally(() => {
        pendingSession = null
      })
  }

  return pendingSession
}
