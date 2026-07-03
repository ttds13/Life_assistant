import { Transform } from 'class-transformer'
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

export class RejectOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  reason?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => Number(value))
  version?: number
}
