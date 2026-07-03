export interface LoginResult {
  accessToken: string
  refreshToken?: string
  expiresIn: number
  refreshExpiresIn?: number
  tokenType?: 'Bearer'
  user: UserProfile
}

export interface UserProfile {
  id: number
  phone: string
  nickname: string
  avatar: string
  avatarOssUrl?: string
  avatarDisplayUrl?: string
  role: 'user' | 'staff'
}

export interface WechatLoginParams {
  loginCode: string
  phoneCode: string
}

export interface MockLoginParams {
  phone?: string
}

export interface UpdateProfileParams {
  nickname?: string
  avatar?: string
}
