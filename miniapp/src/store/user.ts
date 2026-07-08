import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { UserProfile } from '@/api/types/auth'
import { getMe } from '@/api/auth'

export type UserRole = 'user' | 'staff'

export const DEFAULT_AVATAR_URL = '/static/images/default-avatar.png'

const SIGNED_URL_EXPIRE_SKEW_MS = 5 * 60 * 1000

export interface UserInfo {
  userId: number
  phone: string
  nickname: string
  avatar: string
  avatarOssUrl: string
  role: UserRole
}

const defaultUserInfo: UserInfo = {
  userId: -1,
  phone: '',
  nickname: '',
  avatar: DEFAULT_AVATAR_URL,
  avatarOssUrl: '',
  role: 'user',
}

function isLocalHttpUrl(url?: string) {
  const normalizedUrl = (url || '').toLowerCase()
  const httpPrefix = 'http://'
  if (!normalizedUrl.startsWith(httpPrefix))
    return false

  const host = normalizedUrl.slice(httpPrefix.length).split(/[/:?#]/)[0]
  if (host === ['local', 'host'].join(''))
    return true

  const segments = host.split('.').map(segment => Number(segment))
  if (segments.some(segment => Number.isNaN(segment)))
    return false

  const [first, second, third, fourth] = segments
  if (first === 127 && second === 0 && third === 0 && fourth === 1)
    return true
  if (first === 10)
    return true
  if (first === 192 && second === 168)
    return true

  return first === 172 && second >= 16 && second <= 31
}

function isExpiredSignedUrl(url?: string) {
  const expires = /[?&]Expires=(\d+)/.exec(url || '')?.[1]
  if (!expires)
    return false

  return Date.now() + SIGNED_URL_EXPIRE_SKEW_MS >= Number(expires) * 1000
}

function isSafeDisplayUrl(url?: string) {
  return !!url && !isLocalHttpUrl(url) && !isExpiredSignedUrl(url)
}

function profileToUserInfo(profile: UserProfile, current?: UserInfo): UserInfo {
  const remoteAvatar = profile.avatarOssUrl || profile.avatar || ''
  const remoteDisplayAvatar = profile.avatarDisplayUrl || profile.avatar || ''
  const reusableDisplayAvatar = current?.avatarOssUrl === remoteAvatar && isSafeDisplayUrl(current?.avatar)
    ? current.avatar
    : ''
  const safeRemoteAvatar = isSafeDisplayUrl(remoteDisplayAvatar) ? remoteDisplayAvatar : ''
  const safeAvatarOssUrl = isLocalHttpUrl(remoteAvatar) ? '' : remoteAvatar

  return {
    userId: profile.id,
    phone: profile.phone,
    nickname: profile.nickname,
    avatar: safeRemoteAvatar || reusableDisplayAvatar || defaultUserInfo.avatar,
    avatarOssUrl: safeAvatarOssUrl,
    role: profile.role,
  }
}

export const useUserStore = defineStore(
  'user',
  () => {
    const userInfo = ref<UserInfo>({ ...defaultUserInfo })

    const setUserInfo = (val: UserInfo) => {
      if (!val.avatar) val.avatar = defaultUserInfo.avatar
      if (!val.avatarOssUrl) val.avatarOssUrl = ''
      userInfo.value = val
    }

    const setFromProfile = (profile: UserProfile) => {
      setUserInfo(profileToUserInfo(profile, userInfo.value))
    }

    const clearUserInfo = () => {
      userInfo.value = { ...defaultUserInfo }
    }

    const fetchUserInfo = async () => {
      const profile = await getMe()
      setFromProfile(profile)
    }

    return {
      userInfo,
      setUserInfo,
      setFromProfile,
      clearUserInfo,
      fetchUserInfo,
    }
  },
  {
    persist: true,
  },
)
