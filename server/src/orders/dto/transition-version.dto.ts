import { Transform } from 'class-transformer'
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return Number(value)
}

export class TransitionVersionDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => toOptionalNumber(value))
  version?: number

  @IsOptional()
  @IsString()
  @MaxLength(256)
  reason?: string
}
