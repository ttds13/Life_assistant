import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { UserProfile } from '@/api/types/auth'
import { getMe } from '@/api/auth'

export type UserRole = 'user' | 'staff'

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
  avatar: '/static/images/default-avatar.png',
  avatarOssUrl: '',
  role: 'user',
}

function isLocalHttpUrl(url?: string) {
  return /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url || '')
}

function profileToUserInfo(profile: UserProfile, current?: UserInfo): UserInfo {
  const remoteAvatar = profile.avatarOssUrl || profile.avatar || ''
  const localDisplayAvatar = current?.avatarOssUrl === remoteAvatar && current?.avatar && !isLocalHttpUrl(current.avatar)
    ? current.avatar
    : ''

  return {
    userId: profile.id,
    phone: profile.phone,
    nickname: profile.nickname,
    avatar: localDisplayAvatar || profile.avatarDisplayUrl || profile.avatar || defaultUserInfo.avatar,
    avatarOssUrl: remoteAvatar,
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
