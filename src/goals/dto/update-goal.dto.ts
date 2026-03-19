import { IsString, IsOptional, IsBoolean, IsNumber, IsEnum, Min } from 'class-validator';

export class UpdateGoalDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  applicationsOpen?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  defaultDurationMins?: number;

  @IsOptional()
  @IsString()
  defaultPlatform?: string;

  @IsOptional()
  @IsEnum(['2h', '6h', '12h', '24h'])
  approvalDeadlineOffset?: string;
}
