import { Transform } from 'class-transformer'
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

export class AssignOrderDto {
  @IsInt()
  @Min(1)
  @Transform(({ value }) => Number(value))
  staffId!: number

  @IsOptional()
  @IsString()
  @MaxLength(256)
  remark?: string
}
