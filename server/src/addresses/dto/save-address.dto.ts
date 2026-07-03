import { Transform } from 'class-transformer'
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator'

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
  country?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trim(value))
  provinceName?: string

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

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trim(value))
  streetName?: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Transform(({ value }) => trim(value))
  addressTitle?: string

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
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Transform(({ value }) => toOptionalNumber(value))
  latitude?: number | null

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Transform(({ value }) => toOptionalNumber(value))
  longitude?: number | null

  @IsOptional()
  @IsString()
  @IsIn(['gcj02', 'wgs84', 'bd09'])
  @Transform(({ value }) => trim(value))
  coordinateType?: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Transform(({ value }) => trim(value))
  poiId?: string

  @IsOptional()
  @IsString()
  @IsIn(['tencent', 'amap'])
  @Transform(({ value }) => trim(value))
  mapProvider?: string

  @IsOptional()
  @IsString()
  @IsIn(['service', 'home', 'work', 'billing'])
  @Transform(({ value }) => trim(value))
  addressType?: string
}

export class AdminSaveAddressDto extends SaveAddressDto {
  @IsString()
  @IsIn(['user', 'staff'])
  @Transform(({ value }) => trim(value))
  ownerType!: string

  @IsNumber()
  @Min(1)
  @Transform(({ value }) => Number(value))
  ownerId!: number
}
