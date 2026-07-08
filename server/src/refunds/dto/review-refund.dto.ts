import { Transform } from 'class-transformer'
import { IsIn, IsOptional, IsString } from 'class-validator'

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export class ReviewRefundDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  remark?: string
}

export class RejectRefundDto extends ReviewRefundDto {
  @IsOptional()
  @IsIn(['pending_dispatch', 'after_sales'])
  nextOrderStatus?: 'pending_dispatch' | 'after_sales'
}
