// 服务分类
export interface ServiceCategory {
  id: number
  name: string
  icon: string
  sortOrder: number
  status: number
}

// 服务项目
export interface Service {
  id: number
  code?: string
  categoryId: number
  name: string
  description: string
  basePrice: number
  priceUnit: string
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
  status?: number
  page?: number
  pageSize?: number
}
