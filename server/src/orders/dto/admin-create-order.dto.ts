import { Transform, Type } from 'class-transformer'
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return Number(value)
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'boolean') return value
  return ['true', '1', 'yes'].includes(String(value).trim().toLowerCase())
}

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const result = value.trim()
  return result || undefined
}

export class AdminOrderCustomerDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nickname?: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  gender?: number

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cityCode?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  adminRemark?: string
}

export class AdminOrderAddressDto {
  @IsString()
  @MaxLength(64)
  contactName!: string

  @IsString()
  @MaxLength(20)
  contactPhone!: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  provinceName?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  cityName?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  districtName?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  streetName?: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  addressTitle?: string

  @IsString()
  @MaxLength(256)
  detailAddress!: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  houseNumber?: string

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => toOptionalNumber(value))
  latitude?: number

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => toOptionalNumber(value))
  longitude?: number

  @IsOptional()
  @IsString()
  @MaxLength(16)
  coordinateType?: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  poiId?: string

  @IsOptional()
  @IsString()
  @MaxLength(16)
  mapProvider?: string

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => toOptionalBoolean(value))
  isDefault?: boolean
}

export class AdminCreateOrderDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  userId?: number

  @IsOptional()
  @ValidateNested()
  @Type(() => AdminOrderCustomerDto)
  customer?: AdminOrderCustomerDto

  @IsInt()
  @Min(1)
  @Type(() => Number)
  serviceId!: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  addressId?: number

  @IsOptional()
  @ValidateNested()
  @Type(() => AdminOrderAddressDto)
  address?: AdminOrderAddressDto

  @IsString()
  appointmentStartTime!: string

  @IsString()
  appointmentEndTime!: string

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Transform(({ value }) => trimOptional(value))
  source?: string

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Transform(({ value }) => trimOptional(value))
  paymentMode?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  memberCardId?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  couponId?: number

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  offlinePaidAt?: string

  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Transform(({ value }) => trimOptional(value))
  offlinePaymentRemark?: string

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
}
