import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value
}

function toNumber(value: unknown): number {
  return Number(value)
}

export class AdminUserMemberCardActionDto {
  @IsInt()
  @Min(0)
  @Transform(({ value }) => toNumber(value))
  expectedVersion!: number

  @IsString()
  @MinLength(8)
  @MaxLength(96)
  @Transform(({ value }) => trim(value))
  idempotencyKey!: string

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @Transform(({ value }) => trim(value))
  reason!: string
}

export class AdminUserMemberCardExtendDto extends AdminUserMemberCardActionDto {
  @IsInt()
  @Min(1)
  @Max(3650)
  @Transform(({ value }) => toNumber(value))
  days!: number
}

export class AdminUserMemberCardAdjustDto extends AdminUserMemberCardActionDto {
  @IsIn(['delta', 'target'])
  mode!: 'delta' | 'target'

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => toNumber(value))
  deltaMinutes?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toNumber(value))
  targetRemainingMinutes?: number
}
