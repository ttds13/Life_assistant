import { http } from '@/http/http'
import type {
  FeedbackRecord,
  SupportConfig,
  SupportFaqResponse,
  StaffApplication,
  SubmitFeedbackPayload,
  SubmitStaffApplicationPayload,
} from './types/support'

export function getMyStaffApplication() {
  return http.get<StaffApplication | null>('/staff/applications/me')
}

export function submitStaffApplication(data: SubmitStaffApplicationPayload) {
  return http.post<StaffApplication>('/staff/applications', data)
}

export function submitFeedback(data: SubmitFeedbackPayload) {
  return http.post<FeedbackRecord>('/feedback', data)
}

export function getMyFeedback() {
  return http.get<FeedbackRecord[]>('/feedback/my')
}

export function getSupportConfig() {
  return http.get<SupportConfig>('/support/config')
}

export function getSupportFaqs() {
  return http.get<SupportFaqResponse>('/support/faqs')
}
