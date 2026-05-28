import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable, map } from 'rxjs'
import { SKIP_RESPONSE_TRANSFORM } from '../decorators/skip-response-transform.decorator'
import { ErrorCode } from '../errors/error-code'
import { serialize } from '../serialize/serialize'
import { getRequestId, RequestWithContext } from '../utils/request-context'

@Injectable()
export class ResponseTransformInterceptor implements NestInterceptor {
  constructor(private readonly reflector?: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector?.getAllAndOverride<boolean>(SKIP_RESPONSE_TRANSFORM, [
      context.getHandler(),
      context.getClass(),
    ])

    if (skip) return next.handle()

    const request = context.switchToHttp().getRequest<RequestWithContext>()

    return next.handle().pipe(
      map((data) => ({
        code: ErrorCode.OK,
        message: 'ok',
        data: serialize(data),
        requestId: getRequestId(request),
        timestamp: new Date().toISOString(),
      })),
    )
  }
}
