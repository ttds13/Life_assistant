import { Transform } from 'class-transformer'
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator'

function trim(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const result = value.trim()
  return result || undefined
}

function toNumber(value: unknown): number {
  return Number(value)
}

export class GeocodeDto {
  @IsString()
  @Transform(({ value }) => trim(value))
  address!: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trim(value))
  city?: string
}

export class ReverseGeocodeDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Transform(({ value }) => toNumber(value))
  latitude!: number

  @IsNumber()
  @Min(-180)
  @Max(180)
  @Transform(({ value }) => toNumber(value))
  longitude!: number
}

export class PlaceSuggestionsDto {
  @IsString()
  @Transform(({ value }) => trim(value))
  keyword!: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trim(value))
  city?: string
}
