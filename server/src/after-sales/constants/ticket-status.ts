export const TICKET_STATUS = {
  OPEN: 'open',
  PENDING: 'pending',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
  CLOSED: 'closed',
} as const

export type TicketStatus = typeof TICKET_STATUS[keyof typeof TICKET_STATUS]

export const ACTIVE_TICKET_STATUSES = [
  TICKET_STATUS.OPEN,
  TICKET_STATUS.PENDING,
] as const
