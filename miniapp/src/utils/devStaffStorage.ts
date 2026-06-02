import type { DevStaffSession } from '@/api/types/auth'
import { useUserStore } from '@/store/user'

export const DEV_STAFF_ID_KEY = 'DEV_STAFF_ID'
export const DEV_STAFF_SESSION_KEY = 'DEV_STAFF_SESSION'

function currentUserId() {
  const userStore = useUserStore()
  return Number(userStore.userInfo.userId || 0)
}

export function clearDevStaffSession() {
  uni.removeStorageSync(DEV_STAFF_ID_KEY)
  uni.removeStorageSync(DEV_STAFF_SESSION_KEY)
}

export function saveDevStaffSession(session: DevStaffSession) {
  uni.setStorageSync(DEV_STAFF_ID_KEY, String(session.staffId))
  uni.setStorageSync(DEV_STAFF_SESSION_KEY, session)
}

export function getStoredDevStaffSession() {
  const userId = currentUserId()
  const session = uni.getStorageSync(DEV_STAFF_SESSION_KEY) as DevStaffSession | ''
  if (!userId || !session || typeof session !== 'object') {
    clearDevStaffSession()
    return null
  }

  if (Number(session.userId) !== userId || !Number(session.staffId)) {
    clearDevStaffSession()
    return null
  }

  const storedStaffId = String(uni.getStorageSync(DEV_STAFF_ID_KEY) || '').trim()
  if (storedStaffId !== String(session.staffId)) {
    uni.setStorageSync(DEV_STAFF_ID_KEY, String(session.staffId))
  }

  return session
}

export function getCurrentDevStaffId() {
  const session = getStoredDevStaffSession()
  return session ? String(session.staffId) : ''
}
