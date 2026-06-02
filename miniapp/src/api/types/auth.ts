export interface LoginResult {
  accessToken: string
  expiresIn: number
  user: UserProfile
}

export interface UserProfile {
  id: number
  phone: string
  nickname: string
  avatar: string
  role: 'user' | 'staff'
}

export interface WechatLoginParams {
  loginCode: string
  phoneCode: string
}

export interface MockLoginParams {
  phone: string
}

export interface UpdateProfileParams {
  nickname?: string
  avatar?: string
}

export interface DevStaffSession {
  staffId: number
  userId: number
  phone: string
  staffName: string
  staffPhone: string
}
