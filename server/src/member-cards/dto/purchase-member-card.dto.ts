import { Transform } from 'class-transformer'
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

function toNumber(value: unknown): number {
  return Number(value)
}

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const result = value.trim()
  return result || undefined
}

export class PurchaseMemberCardDto {
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toNumber(value))
  cardId!: number

  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Transform(({ value }) => trimOptional(value))
  remark?: string

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Transform(({ value }) => trimOptional(value))
  source?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  promotionKey?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  campaignId?: string
}
