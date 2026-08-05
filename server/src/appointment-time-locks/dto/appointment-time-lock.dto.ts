import { Transform } from 'class-transformer'
import { IsArray, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator'
import { BASE_APPOINTMENT_TIME_SLOTS } from '../appointment-slots'

function trim(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const result = value.trim()
  return result || undefined
}

export class AppointmentSlotsQueryDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string
}

export class AdminAppointmentTimeLockQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateStart?: string

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateEnd?: string

  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive'])
  status?: string
}

export class CreateAppointmentTimeLockDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  lockDate!: string

  @IsOptional()
  @IsString()
  @IsIn(BASE_APPOINTMENT_TIME_SLOTS)
  timeSlot?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(BASE_APPOINTMENT_TIME_SLOTS, { each: true })
  timeSlots?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Transform(({ value }) => trim(value))
  reason?: string
}

export class UpdateAppointmentTimeLockDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  lockDate?: string

  @IsOptional()
  @IsString()
  @IsIn(BASE_APPOINTMENT_TIME_SLOTS)
  timeSlot?: string

  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive'])
  status?: string

  @IsOptional()
  @IsString()
  @MaxLength(256)
  reason?: string
}
