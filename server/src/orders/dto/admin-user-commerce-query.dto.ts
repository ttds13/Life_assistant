import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { ORDER_STATUS_VALUES } from '../constants/order-status'

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return Number(value)
}

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

class AdminUserCommercePageQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toOptionalNumber(value))
  userId?: number

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  keyword?: string

  @IsOptional()
  @IsIn(['all', ...ORDER_STATUS_VALUES])
  @Transform(({ value }) => trimOptional(value))
  status?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  source?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  dateStart?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  dateEnd?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toOptionalNumber(value))
  page?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => toOptionalNumber(value))
  pageSize?: number
}

export class AdminUserProductOrdersQueryDto extends AdminUserCommercePageQueryDto {
  @IsOptional()
  @IsIn(['service_product', 'member_card_product'])
  @Transform(({ value }) => trimOptional(value))
  productType?: 'service_product' | 'member_card_product'
}

export class AdminUserServiceBookingsQueryDto extends AdminUserCommercePageQueryDto {
  @IsOptional()
  @IsIn(['service_entitlement', 'member_card_entitlement'])
  @Transform(({ value }) => trimOptional(value))
  entitlementType?: 'service_entitlement' | 'member_card_entitlement'

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toOptionalNumber(value))
  serviceId?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toOptionalNumber(value))
  staffId?: number
}

export class AdminUserCommerceOverviewQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  @Transform(({ value }) => toOptionalNumber(value))
  recentLimit?: number
}
