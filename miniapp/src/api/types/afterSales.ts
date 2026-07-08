export type AfterSalesTicketType = 'refund' | 'service_quality' | 'reschedule' | 'complaint' | 'other'

export type AfterSalesTicketStatus = 'open' | 'pending' | 'resolved' | 'rejected' | 'closed' | string

export interface AfterSalesMessage {
  id: number
  senderType: 'user' | 'admin' | string
  senderId: number
  content: string
  images: string[]
  createdAt: string
}

export interface AfterSalesTicket {
  id: number
  ticketNo: string
  orderId: number
  orderNo: string
  orderStatus: string
  userId: number
  userName?: string
  userPhone?: string
  staffId?: number | null
  type: AfterSalesTicketType | string
  title: string
  description: string
  status: AfterSalesTicketStatus
  priority?: number
  latestMessage?: string
  handledBy?: number | null
  resolvedAt?: string | null
  createdAt: string
  updatedAt: string
  messages?: AfterSalesMessage[]
}

export interface CreateAfterSalesPayload {
  type: AfterSalesTicketType
  title: string
  description: string
  contactPhone?: string
  images?: string[]
}

export interface AddAfterSalesMessagePayload {
  content: string
  images?: string[]
}
