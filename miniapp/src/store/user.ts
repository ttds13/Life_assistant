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
  role: UserRole
}

const defaultUserInfo: UserInfo = {
  userId: -1,
  phone: '',
  nickname: '',
  avatar: '/static/images/default-avatar.png',
  role: 'user',
}

function profileToUserInfo(profile: UserProfile): UserInfo {
  return {
    userId: profile.id,
    phone: profile.phone,
    nickname: profile.nickname,
    avatar: profile.avatar || defaultUserInfo.avatar,
    role: profile.role,
  }
}

export const useUserStore = defineStore(
  'user',
  () => {
    const userInfo = ref<UserInfo>({ ...defaultUserInfo })

    const setUserInfo = (val: UserInfo) => {
      if (!val.avatar) val.avatar = defaultUserInfo.avatar
      userInfo.value = val
    }

    const setFromProfile = (profile: UserProfile) => {
      setUserInfo(profileToUserInfo(profile))
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
