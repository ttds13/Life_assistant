import { getEnvBaseUrl } from '@/utils'
import { useTokenStore } from '@/store/token'
import { useUserStore } from '@/store/user'
import { refreshLogin } from '@/api/auth'

export interface UploadedImage {
  url: string
  signedUrl?: string
  displayUrl?: string
  storageKey?: string
  mimeType?: string
  size?: number
  expiresIn?: number
}

export interface UploadImageOptions {
  filePath: string
  bizType?: string
  bizId?: number | string
}

function parseUploadError(error: any) {
  if (typeof error?.message === 'string' && error.message)
    return error.message
  if (typeof error?.errMsg === 'string' && error.errMsg)
    return error.errMsg
  return 'upload failed'
}

function guessMimeType(filePath: string) {
  const path = filePath.split('?')[0].toLowerCase()
  if (path.endsWith('.png'))
    return 'image/png'
  if (path.endsWith('.webp'))
    return 'image/webp'
  return 'image/jpeg'
}

async function resolveUploadToken() {
  const tokenStore = useTokenStore()
  const userStore = useUserStore()
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

export async function uploadImage(options: UploadImageOptions): Promise<UploadedImage> {
  const token = await resolveUploadToken()
  try {
    return await uploadImageByFile(options, token)
  }
  catch (error) {
    console.warn('upload_image_file_failed_try_base64', error)
    return uploadImageByBase64(options, token, error)
  }
}

async function uploadImageByFile(options: UploadImageOptions, token: string): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: `${getEnvBaseUrl()}/upload/image`,
      filePath: options.filePath,
      name: 'file',
      header: token ? { Authorization: `Bearer ${token}` } : undefined,
      formData: {
        ...(options.bizType ? { bizType: options.bizType } : {}),
        ...(options.bizId !== undefined ? { bizId: String(options.bizId) } : {}),
      },
      success: (uploadRes) => {
        try {
          const rawData = typeof uploadRes.data === 'string' ? uploadRes.data : String(uploadRes.data)
          const parsed = rawData ? JSON.parse(rawData) : {}
          if (uploadRes.statusCode < 200 || uploadRes.statusCode >= 300) {
            reject(new Error(parsed?.message || `upload failed: ${uploadRes.statusCode}`))
            return
          }
          if (parsed?.code !== undefined && parsed.code !== 0 && parsed.code !== 200) {
            reject(new Error(parsed?.message || `upload failed: ${parsed.code}`))
            return
          }
          const data = parsed.data || parsed
          if (!data?.url) {
            reject(new Error('upload response missing url'))
            return
          }
          resolve({
            ...data,
            displayUrl: data.signedUrl || data.displayUrl || data.url,
          })
        }
        catch (error) {
          reject(error)
        }
      },
      fail: reject,
    })
  })
}

async function readFileAsBase64(filePath: string) {
  // #ifdef MP-WEIXIN
  return new Promise<string>((resolve, reject) => {
    const fs = uni.getFileSystemManager()
    fs.readFile({
      filePath,
      encoding: 'base64',
      success: (res) => resolve(String(res.data || '')),
      fail: reject,
    })
  })
  // #endif

  throw new Error('base64 upload fallback is only available in WeChat mini program')
}

async function uploadImageByBase64(options: UploadImageOptions, token: string, cause?: unknown): Promise<UploadedImage> {
  const imageBase64 = await readFileAsBase64(options.filePath)
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${getEnvBaseUrl()}/upload/image-base64`,
      method: 'POST',
      header: token ? { Authorization: `Bearer ${token}` } : undefined,
      data: {
        imageBase64,
        mimeType: guessMimeType(options.filePath),
        fileName: `avatar.${guessMimeType(options.filePath).split('/')[1] || 'jpg'}`,
        ...(options.bizType ? { bizType: options.bizType } : {}),
        ...(options.bizId !== undefined ? { bizId: String(options.bizId) } : {}),
      },
      success: (res) => {
        try {
          const parsed: any = res.data || {}
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(parsed?.message || `base64 upload failed: ${res.statusCode}`))
            return
          }
          if (parsed?.code !== undefined && parsed.code !== 0 && parsed.code !== 200) {
            reject(new Error(parsed?.message || `base64 upload failed: ${parsed.code}`))
            return
          }
          const data = parsed.data || parsed
          if (!data?.url) {
            reject(new Error('base64 upload response missing url'))
            return
          }
          resolve({
            ...data,
            displayUrl: data.signedUrl || data.displayUrl || data.url,
          })
        }
        catch (error) {
          reject(error)
        }
      },
      fail: (error) => {
        const original = parseUploadError(cause)
        const fallback = parseUploadError(error)
        reject(new Error(`${fallback}; original: ${original}`))
      },
    })
  })
}

export function assertImageSize(size?: number, maxSize = 5 * 1024 * 1024) {
  if (size !== undefined && size > maxSize) {
    uni.showToast({
      icon: 'none',
      title: `图片不能超过 ${Math.floor(maxSize / 1024 / 1024)}MB`,
    })
    return false
  }
  return true
}
