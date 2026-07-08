import type { Request } from 'express'

export interface RequestContext {
  requestId: string
  source: string
  clientVersion: string
  startedAt?: bigint
  user?: {
    userId: number
    adminId?: number
    phone?: string
    username?: string
    role?: string
    roles?: string[]
    perms?: string[]
    userType?: 'user' | 'staff' | 'admin'
  }
}

export type RequestWithContext = Request & {
  context?: RequestContext
  user?: RequestContext['user']
  rawBody?: Buffer
}

export function getRequestId(request: RequestWithContext): string {
  return request.context?.requestId || 'req_unknown'
}
