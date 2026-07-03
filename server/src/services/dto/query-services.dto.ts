import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return Number(value)
}

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export class QueryServicesDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  keyword?: string

  @IsOptional()
  @IsString()
  @IsIn(['none', 'time', 'times', 'consultation'])
  @Transform(({ value }) => trimOptional(value))
  cardType?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  serviceCodes?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toOptionalNumber(value))
  categoryId?: number

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => toOptionalNumber(value))
  status?: number

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
