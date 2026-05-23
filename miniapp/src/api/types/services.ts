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
  categoryId: number
  name: string
  description: string
  basePrice: number
  priceUnit: string
  coverImage: string
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