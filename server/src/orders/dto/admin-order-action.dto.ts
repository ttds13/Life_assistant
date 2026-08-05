import { Transform } from 'class-transformer'
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator'

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return Number(value)
}

export class AdminOrderActionDto {
  @IsInt()
  @Min(0)
  @Transform(({ value }) => toOptionalNumber(value))
  version!: number

  @IsString()
  @MinLength(2)
  @MaxLength(256)
  @Transform(({ value }) => trim(value))
  reason!: string
}
