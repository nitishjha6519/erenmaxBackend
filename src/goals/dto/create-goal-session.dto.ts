import { IsString, IsNumber, IsDateString, IsOptional, Min } from 'class-validator';

export class CreateGoalSessionDto {
  @IsString()
  topic: string;

  @IsString()
  category: string;

  @IsDateString()
  scheduledDate: string;

  /** Overrides goal.defaultDurationMins if provided */
  @IsOptional()
  @IsNumber()
  @Min(1)
  durationMins?: number;

  /** Overrides goal.defaultPlatform if provided */
  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  meetingLink?: string;
}
