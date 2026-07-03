import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import type { Response } from 'express'
import { BusinessException } from '../errors/business-exception'
import { ErrorCode } from '../errors/error-code'
import { serialize } from '../serialize/serialize'
import { getRequestId, RequestWithContext } from '../utils/request-context'

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const request = ctx.getRequest<RequestWithContext>()
    const response = ctx.getResponse<Response>()

    const payload = this.toPayload(exception)
    if (!(exception instanceof BusinessException) && exception instanceof Error) {
      console.error(JSON.stringify({
        level: 'error',
        message: 'unhandled_exception',
        errorName: exception.name,
        errorMessage: exception.message,
        stack: exception.stack,
        timestamp: new Date().toISOString(),
      }))
    }
    response.status(payload.httpStatus).json({
      code: payload.code,
      message: payload.message,
      data: serialize(payload.data),
      requestId: getRequestId(request),
      timestamp: new Date().toISOString(),
    })
  }

  private toPayload(exception: unknown): {
    code: ErrorCode
    message: string
    data: unknown
    httpStatus: number
  } {
    if (exception instanceof BusinessException) {
      return {
        code: exception.code,
        message: exception.message,
        data: exception.data,
        httpStatus: exception.httpStatus,
      }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const response = exception.getResponse()
      let message = exception.message || '请求错误'
      let data: unknown = null

      if (typeof response === 'object' && response !== null) {
        const body = response as Record<string, unknown>
        const bodyMessage = body.message
        if (Array.isArray(bodyMessage)) {
          message = bodyMessage.join('; ')
          data = bodyMessage
        }
        else if (typeof bodyMessage === 'string') {
          message = bodyMessage
        }
      }

      return {
        code: status === HttpStatus.NOT_FOUND
          ? ErrorCode.COMMON_NOT_FOUND
          : ErrorCode.COMMON_BAD_REQUEST,
        message,
        data,
        httpStatus: status,
      }
    }

    return {
      code: ErrorCode.COMMON_INTERNAL_ERROR,
      message: '服务器内部错误',
      data: null,
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    }
  }
}
