import { Transform, Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator'
import { AdminOrderAddressDto } from './admin-create-order.dto'

function trim(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const result = value.trim()
  return result || undefined
}

export class UpdateOrderAddressDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  sourceAddressId?: number

  @IsOptional()
  @ValidateNested()
  @Type(() => AdminOrderAddressDto)
  address?: AdminOrderAddressDto

  @IsInt()
  @Min(0)
  @Type(() => Number)
  expectedOrderVersion!: number

  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedOrderAddressVersion!: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedSourceAddressVersion?: number

  @IsString()
  @MinLength(2)
  @MaxLength(256)
  @Transform(({ value }) => trim(value))
  reason!: string
}
