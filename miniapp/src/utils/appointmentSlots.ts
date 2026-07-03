export const BASE_APPOINTMENT_TIME_SLOTS = [
  '08:00-10:00',
  '10:00-12:00',
  '12:00-14:00',
  '14:00-16:00',
  '16:00-17:00',
]

export interface AppointmentDateOption {
  label: string
  value: string
}

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function isSameDateValue(dateText: string, date: Date) {
  return dateText === dateValue(date)
}

function slotStartMinutes(slot: string) {
  const [start] = slot.split('-')
  const [hour, minute] = start.split(':').map(Number)
  return hour * 60 + minute
}

export function buildAppointmentDateOptions(days = 5): AppointmentDateOption[] {
  const result: AppointmentDateOption[] = []
  const now = new Date()
  for (let i = 0; i < days; i += 1) {
    const date = new Date(now)
    date.setDate(now.getDate() + i)
    const value = dateValue(date)
    const label = i === 0 ? '今天' : i === 1 ? '明天' : `${date.getMonth() + 1}月${date.getDate()}日`
    result.push({ label, value })
  }
  return result
}

export function availableAppointmentSlots(dateText: string, now = new Date()) {
  if (!dateText) return []
  if (!isSameDateValue(dateText, now)) return BASE_APPOINTMENT_TIME_SLOTS

  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  if (currentMinutes >= 17 * 60) return []
  return BASE_APPOINTMENT_TIME_SLOTS.filter(slot => slotStartMinutes(slot) > currentMinutes)
}

export function formatAppointmentDate(date: Date) {
  return dateValue(date)
}

export function formatAppointmentTimeSlot(start: Date, end: Date) {
  const startText = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
  const endText = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
  return `${startText}-${endText}`
}
