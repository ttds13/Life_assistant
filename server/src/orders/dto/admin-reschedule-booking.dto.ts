import { Transform } from 'class-transformer'
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator'

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value
}

function toNumber(value: unknown): number {
  return Number(value)
}

export class AdminRescheduleBookingDto {
  @IsInt()
  @Min(0)
  @Transform(({ value }) => toNumber(value))
  expectedVersion!: number

  @IsString()
  @MinLength(2)
  @MaxLength(256)
  @Transform(({ value }) => trim(value))
  reason!: string

  @IsString()
  appointmentStartTime!: string

  @IsString()
  appointmentEndTime!: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Transform(({ value }) => trim(value))
  remark?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Transform(({ value }) => trim(value))
  adminRemark?: string
}
