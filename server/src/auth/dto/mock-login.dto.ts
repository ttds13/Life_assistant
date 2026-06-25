import { IsOptional, IsString, Matches } from 'class-validator'

export class MockLoginDto {
  @IsOptional()
  @IsString()
  @Matches(/^1\d{10}$/, { message: 'phone must be a valid mainland China mobile number' })
  phone?: string
}
