import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator'

export class SubmitStaffProfileChangeDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  staffName?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatar?: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cityCode?: string

  @IsOptional()
  @IsArray()
  skills?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(20)
  idCard?: string

  @IsOptional()
  @IsString()
  applicationNote?: string

  @IsOptional()
  @IsArray()
  applicationImages?: string[]

  @IsOptional()
  @IsString()
  submitNote?: string
}
