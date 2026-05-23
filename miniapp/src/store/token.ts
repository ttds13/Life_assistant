import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useUserStore } from './user'

export interface TokenInfo {
  token: string
  expiresIn: number
}

export const useTokenStore = defineStore(
  'token',
  () => {
    const tokenInfo = ref<TokenInfo>({ token: '', expiresIn: 0 })
    const expireTime = ref(0)

    const setTokenInfo = (val: TokenInfo) => {
      tokenInfo.value = val
      expireTime.value = Date.now() + val.expiresIn * 1000
    }

    const validToken = computed(() => {
      if (!tokenInfo.value.token) return ''
      if (Date.now() >= expireTime.value) return ''
      return tokenInfo.value.token
    })

    const hasLogin = computed(() => {
      return !!validToken.value
    })

    const logout = () => {
      tokenInfo.value = { token: '', expiresIn: 0 }
      expireTime.value = 0
      const userStore = useUserStore()
      userStore.clearUserInfo()
    }

    return {
      tokenInfo,
      setTokenInfo,
      validToken,
      hasLogin,
      logout,
    }
  },
  {
    persist: true,
  },
)