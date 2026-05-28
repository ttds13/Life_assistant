import { IsString, Matches } from 'class-validator'

export class MockLoginDto {
  @IsString()
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone!: string
}
