import { IsOptional, IsString, MaxLength } from 'class-validator'

export class AutoAssignOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  remark?: string
}
