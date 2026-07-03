import { Transform } from 'class-transformer'
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator'

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return Number(value)
}

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const result = value.trim()
  return result || undefined
}

export class RescheduleOrderDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  appointmentDate!: string

  @IsString()
  @Matches(/^\d{2}:\d{2}-\d{2}:\d{2}$/)
  appointmentTimeSlot!: string

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => toOptionalNumber(value))
  version?: number

  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Transform(({ value }) => trimOptional(value))
  reason?: string
}
