import { Transform } from 'class-transformer'
import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator'

function toNumber(value: unknown): number {
  return Number(value)
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return Number(value)
}

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const result = value.trim()
  return result || undefined
}

export class GrantMemberCardDto {
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toNumber(value))
  userId!: number

  @IsInt()
  @Min(1)
  @Transform(({ value }) => toNumber(value))
  cardId!: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toOptionalNumber(value))
  totalUnits?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toOptionalNumber(value))
  validityDays?: number

  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Transform(({ value }) => trimOptional(value))
  remark?: string

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Transform(({ value }) => trimOptional(value))
  source?: string

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => toOptionalNumber(value))
  offlinePaymentAmount?: number

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Transform(({ value }) => trimOptional(value))
  paymentChannel?: string

  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Transform(({ value }) => trimOptional(value))
  paymentRemark?: string
}

export class AdminCreateMemberCardPurchaseDto {
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toNumber(value))
  userId!: number

  @IsInt()
  @Min(1)
  @Transform(({ value }) => toNumber(value))
  cardId!: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toOptionalNumber(value))
  couponId?: number

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Transform(({ value }) => trimOptional(value))
  source?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  paymentMode?: string

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => toOptionalNumber(value))
  payableAmount?: number

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  offlinePaidAt?: string

  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Transform(({ value }) => trimOptional(value))
  paymentRemark?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Transform(({ value }) => trimOptional(value))
  remark?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Transform(({ value }) => trimOptional(value))
  adminRemark?: string
}
