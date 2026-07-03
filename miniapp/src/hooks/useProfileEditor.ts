import { refreshLogin, updateProfile } from '@/api/auth'
import type { UserProfile } from '@/api/types/auth'
import { useTokenStore } from '@/store/token'
import type { UserInfo } from '@/store/user'
import { useUserStore } from '@/store/user'
import { uploadImage } from '@/utils/uploadImage'

export interface SaveUserProfileInput {
  nickname?: string
  avatarFilePath?: string
  avatarUrl?: string
}

const DEFAULT_AVATAR = '/static/images/default-avatar.png'
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
  return !value || value === DEFAULT_AVATAR || value.endsWith(DEFAULT_AVATAR)
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

function isLocalHttpUrl(url?: string) {
  return /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url || '')
}

async function persistLocalAvatar(filePath: string, userId: number) {
  if (!filePath || userId <= 0)
    return ''
  if (!isLocalHttpUrl(import.meta.env.VITE_SERVER_BASEURL))
    return filePath

  // #ifdef MP-WEIXIN
  return new Promise<string>((resolve) => {
    const fs = uni.getFileSystemManager()
    const extension = filePath.split('?')[0].split('.').pop() || 'jpg'
    const targetPath = `${wx.env.USER_DATA_PATH}/life-assistant-avatar-${userId}.${extension}`
    fs.copyFile({
      srcPath: filePath,
      destPath: targetPath,
      success: () => resolve(targetPath),
      fail: () => resolve(filePath),
    })
  })
  // #endif

  return filePath
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
      const localAvatarPath = await persistLocalAvatar(input.avatarFilePath, userStore.userInfo.userId)
      const uploaded = await uploadImage({
        filePath: input.avatarFilePath,
        bizType: 'user_avatar',
      })
      payload.avatar = uploaded.url
      avatarDisplayUrl = localAvatarPath || uploaded.displayUrl || uploaded.signedUrl || uploaded.url
    }
    else if (input.avatarUrl !== undefined) {
      payload.avatar = input.avatarUrl.trim()
    }

    if (!payload.nickname && !payload.avatar) {
      throw new Error('请先选择头像或填写昵称')
    }

    const token = await resolveAccessToken()
    const profile = await updateProfile(payload, token ? { Authorization: `Bearer ${token}` } : undefined)
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
