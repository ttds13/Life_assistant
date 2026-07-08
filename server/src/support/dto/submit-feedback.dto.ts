import { IsArray, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { FEEDBACK_TYPE_VALUES, FeedbackType } from '../constants/feedback-type'

export class SubmitFeedbackDto {
  @IsIn(FEEDBACK_TYPE_VALUES)
  type!: FeedbackType

  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  content!: string

  @IsOptional()
  @IsString()
  @Matches(/^1\d{10}$/)
  contactPhone?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[]
}
