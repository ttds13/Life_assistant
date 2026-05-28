import type { Request } from 'express'

export interface RequestContext {
  requestId: string
  source: string
  clientVersion: string
  startedAt?: bigint
  user?: {
    userId: number
    phone?: string
    role?: string
  }
}

export type RequestWithContext = Request & {
  context?: RequestContext
  user?: RequestContext['user']
}

export function getRequestId(request: RequestWithContext): string {
  return request.context?.requestId || 'req_unknown'
}
