import type { UserPointsSummary } from './types/points'
import { http } from '@/http/http'

export function getUserPoints() {
  return http.get<UserPointsSummary>('/user/points')
}
