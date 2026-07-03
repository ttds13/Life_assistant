import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import type { Response } from 'express'
import { Observable } from 'rxjs'
import { AppLoggerService } from '../logger/app-logger.service'
import type { RequestWithContext } from '../utils/request-context'

@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const request = http.getRequest<RequestWithContext>()
    const response = http.getResponse<Response>()
    const startedAt = request.context?.startedAt || process.hrtime.bigint()
    let logged = false

    response.once('finish', () => {
      if (logged) return
      logged = true
      const durationMs = Number((process.hrtime.bigint() - startedAt) / 1000000n)
      this.logger.write('log', 'http_request', {
        requestId: request.context?.requestId,
        method: request.method,
        url: request.originalUrl || request.url,
        statusCode: response.statusCode,
        durationMs,
        source: request.context?.source,
        clientVersion: request.context?.clientVersion,
        ip: request.ip || request.socket?.remoteAddress,
        userAgent: request.headers['user-agent'] || '',
        userId: request.context?.user?.userId,
      })
    })

    return next.handle()
  }
}
