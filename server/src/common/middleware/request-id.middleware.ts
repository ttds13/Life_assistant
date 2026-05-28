import { Injectable, NestMiddleware } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { Response, NextFunction } from 'express'
import type { RequestWithContext } from '../utils/request-context'

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithContext, res: Response, next: NextFunction) {
    const headerValue = req.headers['x-request-id']
    const requestId = typeof headerValue === 'string' && headerValue.trim()
      ? headerValue.trim()
      : `req_${Date.now()}_${randomUUID().slice(0, 8)}`

    req.context = {
      requestId,
      source: String(req.headers['x-request-source'] || 'unknown'),
      clientVersion: String(req.headers['x-client-version'] || ''),
      startedAt: process.hrtime.bigint(),
    }
    res.setHeader('X-Request-Id', requestId)
    next()
  }
}
