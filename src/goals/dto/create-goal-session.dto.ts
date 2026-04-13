import {
  IsString,
  IsNumber,
  IsDateString,
  IsOptional,
  IsUrl,
  Min,
} from "class-validator";

export class CreateGoalSessionDto {
  @IsString()
  topic: string;

  @IsString()
  category: string;

  @IsDateString()
  scheduledDate: string;

  @IsNumber()
  @Min(1)
  stakedPoints: number;

  /** Meeting link is mandatory when posting a session topic */
  @IsUrl()
  meetingLink: string;

  /** Overrides goal.defaultDurationMins if provided */
  @IsOptional()
  @IsNumber()
  @Min(1)
  durationMins?: number;

  /** Overrides goal.defaultPlatform if provided */
  @IsOptional()
  @IsString()
  platform?: string;
}
