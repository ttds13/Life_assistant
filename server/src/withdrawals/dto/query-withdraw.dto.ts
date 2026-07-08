import { Transform } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return Number(value)
}

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export class QueryWithdrawDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  status?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  keyword?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  dateStart?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  dateEnd?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toOptionalNumber(value))
  page?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => toOptionalNumber(value))
  pageSize?: number
}

