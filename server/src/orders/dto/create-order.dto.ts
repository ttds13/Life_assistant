import { Transform } from 'class-transformer'
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator'

function toNumber(value: unknown): number {
  return Number(value)
}

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const result = value.trim()
  return result || undefined
}

export class CreateOrderDto {
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toNumber(value))
  serviceId!: number

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  appointmentDate!: string

  @IsString()
  @Matches(/^\d{2}:\d{2}-\d{2}:\d{2}$/)
  appointmentTimeSlot!: string

  @IsInt()
  @Min(1)
  @Transform(({ value }) => toNumber(value))
  addressId!: number

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Transform(({ value }) => trimOptional(value))
  remark?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toNumber(value))
  couponId?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toNumber(value))
  memberCardId?: number
}
