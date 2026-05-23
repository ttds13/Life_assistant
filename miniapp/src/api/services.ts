import type { PageData } from './types/common'
import type { QueryServicesParams, Service, ServiceCategory } from './types/services'
import { http } from '@/http/http'

// 获取服务分类列表
export function getServiceCategories() {
  return http.get<ServiceCategory[]>('/service-categories')
}

// 获取服务列表（分页）
export function getServices(params?: QueryServicesParams) {
  return http.get<PageData<Service>>('/services', params)
}

// 获取服务详情
export function getServiceDetail(id: number) {
  return http.get<Service>(`/services/${id}`)
}