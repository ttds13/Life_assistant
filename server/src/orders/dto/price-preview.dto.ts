import { Transform } from 'class-transformer'
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator'

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const result = value.trim()
  return result || undefined
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return Number(value)
}

export class PricePreviewDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toOptionalNumber(value))
  serviceId?: number

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/)
  @Transform(({ value }) => trimOptional(value))
  serviceCode?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toOptionalNumber(value))
  couponId?: number
}
