import { Transform } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return Number(value)
}

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export class AdminPageQueryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  keyword?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  keywords?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  status?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  workStatus?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  type?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  recordType?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  cardType?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  source?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  channel?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  couponId?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  userId?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  targetType?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  dateStart?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  dateEnd?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  startDate?: string

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  endDate?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toOptionalNumber(value))
  page?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toOptionalNumber(value))
  pageNum?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => toOptionalNumber(value))
  pageSize?: number
}

export class AdminStatusDto {
  @IsString()
  @Transform(({ value }) => String(value || '').trim())
  status: string
}

export class AdminUserRoleDto {
  @IsIn(['user', 'staff'])
  roleType: 'user' | 'staff'
}

export class AdminAuditReviewDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject'

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  remark?: string
}

export class AdminTicketMessageDto {
  @IsString()
  @Transform(({ value }) => String(value || '').trim())
  content: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  images?: string[]
}
