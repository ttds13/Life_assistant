import { Transform } from 'class-transformer'
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator'

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return Number(value)
}

function nullableTrim(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export class ConfirmOfflinePaymentDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Transform(({ value }) => toOptionalNumber(value))
  amount?: number

  @IsOptional()
  @IsString()
  @Transform(({ value }) => nullableTrim(value))
  paidAt?: string

  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Transform(({ value }) => nullableTrim(value))
  remark?: string
}

