import { IsIn, IsOptional, IsString } from 'class-validator'

export class ReviewStaffProfileChangeDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject'

  @IsOptional()
  @IsString()
  rejectReason?: string

  @IsOptional()
  @IsString()
  remark?: string
}
