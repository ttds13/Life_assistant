import { ErrorCode } from '../errors/error-code'

export interface ResponsePayload<T = unknown> {
  code: ErrorCode | number
  message: string
  data: T
  requestId: string
  timestamp: string
}
