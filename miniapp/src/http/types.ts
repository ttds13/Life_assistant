/**
 * 
 * 
 * 自定义请求参数类型
 */
export type CustomRequestOptions = UniApp.RequestOptions & {
  query?: Record<string, any>
  /** 出错时是否隐藏错误提示 */
  hideErrorToast?: boolean
  /** 是否跳过 401 自动刷新，refresh/logout 接口必须开启 */
  skipAuthRefresh?: boolean
  /** 内部重试标记，防止 401 死循环 */
  _retry?: boolean
} & IUniUploadFileOptions

export type CustomRequestOptions_ = Omit<CustomRequestOptions, 'url'>

// 统一响应格式（匹配 NestJS 后端 ResponseTransformInterceptor）
export interface IResponse<T = any> {
  code: number
  message: string
  data: T
  requestId: string
  timestamp: string
}

// 分页响应数据
export interface IPageData<T = any> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

// 分页请求参数
export interface PageParams {
  page?: number
  pageSize?: number
  keyword?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  [key: string]: any
}
