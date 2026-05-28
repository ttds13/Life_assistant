import { IsString } from 'class-validator'

export class WechatLoginDto {
  @IsString()
  loginCode!: string

  @IsString()
  phoneCode!: string
}
