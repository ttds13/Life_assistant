import type { PageData } from './types/common'
import type { PointLedgerRecord, UserPointsSummary } from './types/points'
import { http } from '@/http/http'

export function getUserPoints() {
  return http.get<UserPointsSummary>('/user/points')
}

export function getUserPointRecords(params?: { page?: number, pageSize?: number }) {
  return http.get<PageData<PointLedgerRecord>>('/user/points/records', {
    page: params?.page || 1,
    pageSize: params?.pageSize || 20,
  })
}
