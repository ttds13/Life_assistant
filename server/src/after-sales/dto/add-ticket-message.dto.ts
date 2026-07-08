import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { Transform } from 'class-transformer'

function trim(value: unknown) {
  return typeof value === 'string' ? value.trim() : value
}

export class AddTicketMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Transform(({ value }) => trim(value))
  content: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  images?: string[]
}
