import { IsArray, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class SubmitStaffApplicationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  name!: string

  @IsString()
  @Matches(/^1\d{10}$/)
  phone!: string

  @IsString()
  @MaxLength(40)
  cityCode!: string

  @IsArray()
  @IsString({ each: true })
  skills!: string[]

  @IsOptional()
  @IsString()
  @MaxLength(20)
  idCard?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[]
}
