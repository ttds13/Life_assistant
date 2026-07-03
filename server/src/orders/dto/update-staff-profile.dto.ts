import { IsOptional, IsString, MaxLength } from 'class-validator'

export class UpdateStaffProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  staffName?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatar?: string
}
