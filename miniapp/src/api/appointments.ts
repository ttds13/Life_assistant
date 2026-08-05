import { http } from '@/http/http'

export interface AppointmentSlotItem {
  timeSlot: string
  available: boolean
  reason?: string
}

export interface AppointmentSlotsResponse {
  date: string
  items: AppointmentSlotItem[]
}

export function getAppointmentSlots(date: string) {
  return http.get<AppointmentSlotsResponse>('/appointments/slots', { date })
}
