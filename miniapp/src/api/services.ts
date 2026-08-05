import type { PageData } from './types/common'
import type { QueryServicesParams, Service, ServiceCategory } from './types/services'
import { http } from '@/http/http'
import type { CustomRequestOptions } from '@/http/types'

// 获取服务分类列表
export function getServiceCategories(options?: Partial<CustomRequestOptions>) {
  return http.get<ServiceCategory[]>('/service-categories', undefined, undefined, options)
}

// 获取服务列表（分页）
export function getServices(params?: QueryServicesParams, options?: Partial<CustomRequestOptions>) {
  return http.get<PageData<Service>>('/services', params, undefined, options)
}

// 获取服务详情
export function getServiceDetail(identifier: number | string) {
  return http.get<Service>(`/services/${encodeURIComponent(String(identifier))}`)
}
