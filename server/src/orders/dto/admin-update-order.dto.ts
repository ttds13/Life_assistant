import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import { ORDER_STATUS_VALUES } from '../constants/order-status'

function trimOptional(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function nullableTrim(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || null
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return Number(value)
}

function toNullableNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  return Number(value)
}

export class AdminUpdateOrderDto {
  @IsOptional()
  @IsIn(ORDER_STATUS_VALUES)
  @Transform(({ value }) => trimOptional(value))
  status?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toNullableNumber(value))
  staffId?: number | null

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  appointmentStartTime?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  appointmentEndTime?: string

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => toOptionalNumber(value))
  originalAmount?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => toOptionalNumber(value))
  discountAmount?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => toOptionalNumber(value))
  payableAmount?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => toOptionalNumber(value))
  paidAmount?: number

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Transform(({ value }) => nullableTrim(value))
  remark?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Transform(({ value }) => nullableTrim(value))
  adminRemark?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(({ value }) => nullableTrim(value))
  cityCode?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Transform(({ value }) => trimOptional(value))
  source?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  createdAt?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => nullableTrim(value))
  paidAt?: string | null

  @IsOptional()
  @IsString()
  @Transform(({ value }) => nullableTrim(value))
  completedAt?: string | null

  @IsOptional()
  @IsString()
  @Transform(({ value }) => nullableTrim(value))
  cancelledAt?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Transform(({ value }) => nullableTrim(value))
  cancelReason?: string | null
}
