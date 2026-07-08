import { Transform } from 'class-transformer'
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator'

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return Boolean(value)
}

export class ReviewWithdrawDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject'

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  remark?: string

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => toOptionalBoolean(value))
  executeNow?: boolean
}

