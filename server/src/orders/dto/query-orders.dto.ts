import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator'
import { ORDER_STATUS_VALUES } from '../constants/order-status'

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return Number(value)
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const result = value.trim()
  return result || undefined
}

export class QueryOrdersDto {
  @IsOptional()
  @IsIn(['all', ...ORDER_STATUS_VALUES])
  @Transform(({ value }) => toOptionalString(value))
  status?: string

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
