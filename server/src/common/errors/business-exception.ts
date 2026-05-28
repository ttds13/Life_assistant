import { ErrorCode } from './error-code'

export class BusinessException extends Error {
  readonly code: ErrorCode
  readonly httpStatus: number
  readonly data: unknown

  constructor(code: ErrorCode, message: string, httpStatus = 400, data: unknown = null) {
    super(message)
    this.name = 'BusinessException'
    this.code = code
    this.httpStatus = httpStatus
    this.data = data
  }
}
