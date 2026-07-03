import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { ORDER_STATUS_VALUES } from '../constants/order-status'
import { ORDER_TYPE_VALUES } from '../constants/order-type'

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return Number(value)
}

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export class AdminQueryOrdersDto {
  @IsOptional()
  @IsIn(['all', ...ORDER_STATUS_VALUES])
  @Transform(({ value }) => trimOptional(value))
  status?: string

  @IsOptional()
  @IsIn(['all', 'bookings', ...ORDER_TYPE_VALUES])
  @Transform(({ value }) => trimOptional(value))
  orderType?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  keyword?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  keywords?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  dateStart?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  dateEnd?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  startDate?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  endDate?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  source?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toOptionalNumber(value))
  page?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toOptionalNumber(value))
  pageNum?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => toOptionalNumber(value))
  pageSize?: number
}
