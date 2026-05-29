import { Transform } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return Number(value)
}

export class CompleteServiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  remark?: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  photoUrls?: string[]

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => toOptionalNumber(value))
  version?: number
}
