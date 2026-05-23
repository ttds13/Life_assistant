// 统一分页请求参数
export interface PageParams {
  page?: number
  pageSize?: number
  keyword?: string
  [key: string]: any
}

// 统一分页响应数据
export interface PageData<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}