import { Transform } from 'class-transformer'
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

function toNumber(value: unknown): number {
  return Number(value)
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return Number(value)
}

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const result = value.trim()
  return result || undefined
}

export class GrantMemberCardDto {
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toNumber(value))
  userId!: number

  @IsInt()
  @Min(1)
  @Transform(({ value }) => toNumber(value))
  cardId!: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toOptionalNumber(value))
  totalUnits?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toOptionalNumber(value))
  validityDays?: number

  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Transform(({ value }) => trimOptional(value))
  remark?: string
}
