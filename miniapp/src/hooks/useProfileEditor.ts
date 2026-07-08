import { refreshLogin, updateProfile } from '@/api/auth'
import type { UserProfile } from '@/api/types/auth'
import { useTokenStore } from '@/store/token'
import type { UserInfo } from '@/store/user'
import { DEFAULT_AVATAR_URL, useUserStore } from '@/store/user'
import { avatarDebugLog } from '@/utils/avatarDebugLog'
import { uploadImage } from '@/utils/uploadImage'

export interface SaveUserProfileInput {
  nickname?: string
  avatarFilePath?: string
  avatarUrl?: string
}

const LEGACY_DEFAULT_AVATAR = '/static/images/default-avatar.png'
const SKIP_KEY_PREFIX = 'life-assistant:profile-complete-skip'
const MAX_NICKNAME_LENGTH = 20

function profileSkipKey(userId: number) {
  return `${SKIP_KEY_PREFIX}:${userId}`
}

export function isDefaultNickname(nickname?: string) {
  const value = (nickname || '').trim()
  return !value || value === '微信用户' || value.startsWith('User_') || value.startsWith('Mock_')
}

export function isDefaultAvatar(avatar?: string) {
  const value = (avatar || '').trim()
  return !value || value === DEFAULT_AVATAR_URL || value === LEGACY_DEFAULT_AVATAR || value.endsWith(LEGACY_DEFAULT_AVATAR)
}

export function shouldCompleteProfile(user: UserInfo) {
  return user.userId > 0 && (isDefaultNickname(user.nickname) || isDefaultAvatar(user.avatar))
}

export function hasSkippedProfileComplete(userId: number) {
  if (userId <= 0)
    return false
  return uni.getStorageSync(profileSkipKey(userId)) === '1'
}

export function markProfileCompleteSkipped(userId: number) {
  if (userId <= 0)
    return
  uni.setStorageSync(profileSkipKey(userId), '1')
}

export function clearProfileCompleteSkipped(userId: number) {
  if (userId <= 0)
    return
  uni.removeStorageSync(profileSkipKey(userId))
}

export function validateNickname(nickname: string) {
  const value = nickname.trim()
  if (!value)
    throw new Error('昵称不能为空')
  if (value.length > MAX_NICKNAME_LENGTH)
    throw new Error(`昵称最多${MAX_NICKNAME_LENGTH}个字符`)
  return value
}

export function useProfileEditor() {
  const tokenStore = useTokenStore()
  const userStore = useUserStore()

  async function resolveAccessToken() {
    const validToken = tokenStore.validToken
    if (validToken)
      return validToken

    const refreshToken = tokenStore.validRefreshToken
    if (!refreshToken)
      return ''

    const result = await refreshLogin(refreshToken)
    tokenStore.setTokenInfo(result)
    userStore.setFromProfile(result.user)
    return tokenStore.validToken
  }

  async function saveUserProfile(input: SaveUserProfileInput): Promise<UserProfile> {
    const payload: { nickname?: string, avatar?: string } = {}
    let avatarDisplayUrl = ''

    if (input.nickname !== undefined) {
      payload.nickname = validateNickname(input.nickname)
    }

    if (input.avatarFilePath) {
      avatarDebugLog('before upload avatarFilePath', input.avatarFilePath)
      const uploaded = await uploadImage({
        filePath: input.avatarFilePath,
        bizType: 'user_avatar',
      })
      avatarDebugLog('upload result', uploaded)
      payload.avatar = uploaded.url
      avatarDisplayUrl = uploaded.displayUrl || uploaded.signedUrl || uploaded.url
    }
    else if (input.avatarUrl !== undefined) {
      payload.avatar = input.avatarUrl.trim()
    }

    if (!payload.nickname && !payload.avatar) {
      throw new Error('请先选择头像或填写昵称')
    }

    const token = await resolveAccessToken()
    const profile = await updateProfile(payload, token ? { Authorization: `Bearer ${token}` } : undefined)
    avatarDebugLog('profile update result', profile)
    userStore.setFromProfile(profile)

    if (avatarDisplayUrl) {
      userStore.setUserInfo({
        ...userStore.userInfo,
        avatar: avatarDisplayUrl,
        avatarOssUrl: payload.avatar || userStore.userInfo.avatarOssUrl,
      })
    }

    clearProfileCompleteSkipped(userStore.userInfo.userId)
    return profile
  }

  return {
    saveUserProfile,
  }
}
