import { Transform } from 'class-transformer'
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator'

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export class CreateWithdrawRequestDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1999.99)
  @Transform(({ value }) => Number(value))
  amount: number

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  remark?: string
}

