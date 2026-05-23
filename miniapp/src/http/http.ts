import type { CustomRequestOptions, IResponse } from '@/http/types'
import { useTokenStore } from '@/store/token'
import { toLoginPage } from '@/utils/toLoginPage'

export function http<T>(options: CustomRequestOptions) {
  return new Promise<T>((resolve, reject) => {
    uni.request({
      ...options,
      dataType: 'json',
      // #ifndef MP-WEIXIN
      responseType: 'json',
      // #endif
      success: (res) => {
        const responseData = res.data as IResponse<T>

        // HTTP 状态码非 2xx
        if (res.statusCode < 200 || res.statusCode >= 300) {
          if (res.statusCode === 401) {
            const tokenStore = useTokenStore()
            tokenStore.logout()
            toLoginPage()
            return reject(responseData)
          }
          !options.hideErrorToast && uni.showToast({
            icon: 'none',
            title: responseData?.message || '请求错误',
          })
          return reject(responseData)
        }

        // 业务码判断：兼容常见的 0 / 200 成功码
        if (responseData.code === 0 || responseData.code === 200) {
          return resolve(responseData.data)
        }

        // 业务码 401：token 过期
        if (responseData.code === 20001 || responseData.code === 20002) {
          const tokenStore = useTokenStore()
          tokenStore.logout()
          toLoginPage()
          return reject(responseData)
        }

        // 其他业务错误
        !options.hideErrorToast && uni.showToast({
          icon: 'none',
          title: responseData.message || '请求错误',
        })
        return reject(responseData)
      },
      fail(err) {
        uni.showToast({
          icon: 'none',
          title: '网络错误，换个网络试试',
        })
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
