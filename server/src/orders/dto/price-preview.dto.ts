import { Transform } from 'class-transformer'
import { IsInt, Min } from 'class-validator'

export class PricePreviewDto {
  @IsInt()
  @Min(1)
  @Transform(({ value }) => Number(value))
  serviceId!: number
}
