import { Transform } from 'class-transformer'
import { IsIn, IsOptional, IsString } from 'class-validator'

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export class ExecuteWithdrawDto {
  @IsOptional()
  @IsIn(['success', 'failed'])
  mockResult?: 'success' | 'failed'

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  remark?: string
}

export class RetryWithdrawDto extends ExecuteWithdrawDto {}

export class ManualHandleWithdrawDto {
  @IsIn(['paid', 'failed', 'cancelled', 'expired', 'manual_handling'])
  status: 'paid' | 'failed' | 'cancelled' | 'expired' | 'manual_handling'

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  remark?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  transferBillNo?: string
}

