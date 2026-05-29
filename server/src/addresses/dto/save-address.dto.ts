import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator'

function trim(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const result = value.trim()
  return result || undefined
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (value === true || value === 'true' || value === '1' || value === 1) return true
  if (value === false || value === 'false' || value === '0' || value === 0) return false
  return Boolean(value)
}

function toOptionalNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === '') return undefined
  if (value === null) return null
  return Number(value)
}

export class SaveAddressDto {
  @IsString()
  @Length(1, 64)
  @Transform(({ value }) => trim(value))
  contactName!: string

  @IsString()
  @Matches(/^1\d{10}$/)
  @Transform(({ value }) => trim(value))
  contactPhone!: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trim(value))
  cityName?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trim(value))
  districtName?: string

  @IsString()
  @Length(1, 256)
  @Transform(({ value }) => trim(value))
  detailAddress!: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trim(value))
  houseNumber?: string

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => toOptionalBoolean(value))
  isDefault?: boolean

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  latitude?: number | null

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  longitude?: number | null
}
