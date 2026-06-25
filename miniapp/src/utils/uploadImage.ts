import { getEnvBaseUrl } from '@/utils'

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

export function uploadImage(options: UploadImageOptions): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: `${getEnvBaseUrl()}/upload/image`,
      filePath: options.filePath,
      name: 'file',
      formData: {
        ...(options.bizType ? { bizType: options.bizType } : {}),
        ...(options.bizId !== undefined ? { bizId: String(options.bizId) } : {}),
      },
      success: (uploadRes) => {
        try {
          const rawData = typeof uploadRes.data === 'string' ? uploadRes.data : String(uploadRes.data)
          const parsed = JSON.parse(rawData)
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
