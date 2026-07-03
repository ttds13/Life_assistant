// 服务分类
export interface ServiceCategory {
  id: number
  name: string
  icon: string
  sortOrder: number
  status: number
  serviceCount?: number
}

// 服务项目
export interface Service {
  id: number
  code?: string
  categoryId: number
  category?: string
  categoryName?: string
  name: string
  description: string
  basePrice: number
  priceUnit: string
  durationMinutes?: number
  cardType?: 'none' | 'time' | 'times' | 'consultation'
  consumeUnit?: number
  consultationRequired?: boolean
  coverImage: string
  coverImageOssUrl?: string
  coverImageDisplayUrl?: string
  status: number
  sortOrder: number
}

// 服务列表查询参数
export interface QueryServicesParams {
  keyword?: string
  categoryId?: number
  cardType?: 'none' | 'time' | 'times' | 'consultation'
  serviceCodes?: string
  status?: number
  page?: number
  pageSize?: number
}
