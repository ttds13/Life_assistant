import { Transform } from 'class-transformer'
import { IsOptional, IsString } from 'class-validator'

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export class CreateRefundRequestDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  reason?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  source?: string
}
