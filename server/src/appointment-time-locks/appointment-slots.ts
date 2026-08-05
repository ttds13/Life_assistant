export const BASE_APPOINTMENT_TIME_SLOTS = [
  '08:00-10:00',
  '10:00-12:00',
  '12:00-14:00',
  '14:00-16:00',
  '16:00-17:00',
] as const

export type AppointmentTimeSlot = typeof BASE_APPOINTMENT_TIME_SLOTS[number]

export function isAppointmentTimeSlot(value: string): value is AppointmentTimeSlot {
  return (BASE_APPOINTMENT_TIME_SLOTS as readonly string[]).includes(value)
}

export function appointmentSlotStartMinutes(slot: string) {
  const [start] = slot.split('-')
  const [hour, minute] = start.split(':').map(Number)
  return hour * 60 + minute
}
