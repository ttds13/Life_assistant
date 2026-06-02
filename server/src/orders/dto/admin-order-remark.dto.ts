import { IsString, MaxLength } from 'class-validator'

export class AdminOrderRemarkDto {
  @IsString()
  @MaxLength(512)
  remark!: string
}
