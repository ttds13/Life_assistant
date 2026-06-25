import type { CustomRequestOptions, IResponse } from '@/http/types'
import type { LoginResult } from '@/api/types/auth'
import { useTokenStore } from '@/store/token'
import { useUserStore } from '@/store/user'
import { toLoginPage } from '@/utils/toLoginPage'

let refreshPromise: Promise<boolean> | null = null

function showErrorToast(title: string) {
  uni.showToast({
    icon: 'none',
    title,
  })
}

function isAuthExpired(responseData: IResponse<any> | undefined, statusCode?: number) {
  return statusCode === 401 || responseData?.code === 20001 || responseData?.code === 20002
}

function clearLoginAndRedirect() {
  const tokenStore = useTokenStore()
  tokenStore.logout()
  toLoginPage()
}

async function refreshAccessToken() {
  const tokenStore = useTokenStore()
  const userStore = useUserStore()
  const refreshToken = tokenStore.validRefreshToken

  if (!refreshToken) {
    return false
  }

  if (!refreshPromise) {
    refreshPromise = http<LoginResult>({
      url: '/auth/refresh',
      method: 'POST',
      data: { refreshToken },
      hideErrorToast: true,
      skipAuthRefresh: true,
    })
      .then((result) => {
        tokenStore.setTokenInfo(result)
        userStore.setFromProfile(result.user)
        return true
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

async function handleAuthExpired<T>(options: CustomRequestOptions, responseData: IResponse<T> | undefined) {
  if (options.skipAuthRefresh || options._retry) {
    clearLoginAndRedirect()
    throw responseData
  }

  const refreshed = await refreshAccessToken()
  if (!refreshed) {
    clearLoginAndRedirect()
    throw responseData
  }

  return http<T>({ ...options, _retry: true })
}

export function http<T>(options: CustomRequestOptions) {
  return new Promise<T>((resolve, reject) => {
    uni.request({
      ...options,
      dataType: 'json',
      // #ifndef MP-WEIXIN
      responseType: 'json',
      // #endif
      success: async (res) => {
        const responseData = res.data as IResponse<T> | undefined

        if (res.statusCode < 200 || res.statusCode >= 300) {
          if (isAuthExpired(responseData, res.statusCode)) {
            try {
              return resolve(await handleAuthExpired(options, responseData))
            }
            catch (error) {
              return reject(error)
            }
          }

          !options.hideErrorToast && showErrorToast(responseData?.message || '请求错误')
          return reject(responseData)
        }

        if (responseData?.code === 0 || responseData?.code === 200) {
          return resolve(responseData.data)
        }

        if (isAuthExpired(responseData, res.statusCode)) {
          try {
            return resolve(await handleAuthExpired(options, responseData))
          }
          catch (error) {
            return reject(error)
          }
        }

        !options.hideErrorToast && showErrorToast(responseData?.message || '请求错误')
        return reject(responseData)
      },
      fail(err) {
        !options.hideErrorToast && showErrorToast('网络错误，请检查网络')
        reject(err)
      },
    })
  })
}

export function httpGet<T>(url: string, query?: Record<string, any>, header?: Record<string, any>, options?: Partial<CustomRequestOptions>) {
  return http<T>({ url, query, method: 'GET', header, ...options })
}

export function httpPost<T>(url: string, data?: Record<string, any>, query?: Record<string, any>, header?: Record<string, any>, options?: Partial<CustomRequestOptions>) {
  return http<T>({ url, query, data, method: 'POST', header, ...options })
}

export function httpPut<T>(url: string, data?: Record<string, any>, query?: Record<string, any>, header?: Record<string, any>, options?: Partial<CustomRequestOptions>) {
  return http<T>({ url, data, query, method: 'PUT', header, ...options })
}

export function httpDelete<T>(url: string, query?: Record<string, any>, header?: Record<string, any>, options?: Partial<CustomRequestOptions>) {
  return http<T>({ url, query, method: 'DELETE', header, ...options })
}

http.get = httpGet
http.post = httpPost
http.put = httpPut
http.delete = httpDelete
http.Get = httpGet
http.Post = httpPost
http.Put = httpPut
http.Delete = httpDelete
