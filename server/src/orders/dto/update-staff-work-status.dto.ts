import { Transform } from 'class-transformer'
import { IsIn } from 'class-validator'

function toNumber(value: unknown) {
  return Number(value)
}

export class UpdateStaffWorkStatusDto {
  @IsIn([0, 1, 2])
  @Transform(({ value }) => toNumber(value))
  workStatus!: number
}
