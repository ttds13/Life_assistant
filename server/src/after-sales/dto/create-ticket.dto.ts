import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { Transform } from 'class-transformer'
import { TICKET_TYPE_VALUES, TicketType } from '../constants/ticket-type'

function trim(value: unknown) {
  return typeof value === 'string' ? value.trim() : value
}

export class CreateTicketDto {
  @IsIn(TICKET_TYPE_VALUES)
  type: TicketType

  @IsString()
  @MinLength(2)
  @MaxLength(128)
  @Transform(({ value }) => trim(value))
  title: string

  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  @Transform(({ value }) => trim(value))
  description: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trim(value))
  contactPhone?: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  images?: string[]
}
