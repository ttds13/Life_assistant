export const TICKET_TYPE = {
  REFUND: 'refund',
  SERVICE_QUALITY: 'service_quality',
  RESCHEDULE: 'reschedule',
  COMPLAINT: 'complaint',
  OTHER: 'other',
} as const

export type TicketType = typeof TICKET_TYPE[keyof typeof TICKET_TYPE]

export const TICKET_TYPE_VALUES = Object.values(TICKET_TYPE)
