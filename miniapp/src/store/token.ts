import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { LoginResult } from '@/api/types/auth'
import { useUserStore } from './user'

export interface TokenInfo {
  accessToken: string
  refreshToken: string
  expiresIn: number
  refreshExpiresIn: number
  accessTokenExpiresAt: number
  refreshTokenExpiresAt: number
  tokenType: 'Bearer'
  token?: string
}

type SetTokenInfoInput = Partial<TokenInfo> & Partial<LoginResult>

const ACCESS_EXPIRE_SKEW_MS = 30 * 1000
const DEFAULT_REFRESH_EXPIRES_IN = 30 * 24 * 60 * 60

const defaultTokenInfo = (): TokenInfo => ({
  accessToken: '',
  refreshToken: '',
  expiresIn: 0,
  refreshExpiresIn: 0,
  accessTokenExpiresAt: 0,
  refreshTokenExpiresAt: 0,
  tokenType: 'Bearer',
  token: '',
})

export const useTokenStore = defineStore(
  'token',
  () => {
    const tokenInfo = ref<TokenInfo>(defaultTokenInfo())

    const setTokenInfo = (val: SetTokenInfoInput) => {
      const now = Date.now()
      const accessToken = val.accessToken || val.token || ''
      const refreshToken = val.refreshToken || tokenInfo.value.refreshToken || ''
      const expiresIn = Number(val.expiresIn || 0)
      const refreshExpiresIn = Number(val.refreshExpiresIn || tokenInfo.value.refreshExpiresIn || DEFAULT_REFRESH_EXPIRES_IN)
      const accessTokenExpiresAt = Number(val.accessTokenExpiresAt || (expiresIn > 0 ? now + expiresIn * 1000 : 0))
      const refreshTokenExpiresAt = Number(
        val.refreshTokenExpiresAt || (refreshToken ? now + refreshExpiresIn * 1000 : 0),
      )

      tokenInfo.value = {
        accessToken,
        refreshToken,
        expiresIn,
        refreshExpiresIn,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        tokenType: val.tokenType || 'Bearer',
        token: accessToken,
      }
    }

    const clearToken = () => {
      tokenInfo.value = defaultTokenInfo()
    }

    const validToken = computed(() => {
      if (!tokenInfo.value.accessToken) return ''
      if (Date.now() + ACCESS_EXPIRE_SKEW_MS >= tokenInfo.value.accessTokenExpiresAt) return ''
      return tokenInfo.value.accessToken
    })

    const validRefreshToken = computed(() => {
      if (!tokenInfo.value.refreshToken) return ''
      if (Date.now() >= tokenInfo.value.refreshTokenExpiresAt) return ''
      return tokenInfo.value.refreshToken
    })

    const hasLogin = computed(() => {
      return !!validToken.value || !!validRefreshToken.value
    })

    const isAccessTokenExpired = computed(() => {
      return !validToken.value && !!tokenInfo.value.accessToken
    })

    const canRefresh = computed(() => {
      return !!validRefreshToken.value
    })

    const logout = () => {
      clearToken()
      const userStore = useUserStore()
      userStore.clearUserInfo()
    }

    return {
      tokenInfo,
      setTokenInfo,
      clearToken,
      validToken,
      validRefreshToken,
      hasLogin,
      isAccessTokenExpired,
      canRefresh,
      logout,
    }
  },
  {
    persist: true,
  },
)
