import { Transform } from 'class-transformer'
import { IsInt, IsOptional, IsString, Min } from 'class-validator'

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return Number(value)
}

export class MockSuccessDto {
  @IsOptional()
  @IsString()
  paymentNo?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toOptionalNumber(value))
  orderId?: number
}
