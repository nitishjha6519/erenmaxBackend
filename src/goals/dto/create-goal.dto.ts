import { IsString, IsEnum, IsNumber, IsOptional, Min } from "class-validator";
import { GoalCategory, GoalDifficulty } from "../schemas/goal.schema";

export class CreateGoalDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsEnum(GoalCategory)
  category: string;

  @IsEnum(GoalDifficulty)
  difficulty: string;

  @IsNumber()
  @Min(10)
  pledgedPoints: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  defaultDurationMins?: number;

  @IsOptional()
  @IsString()
  defaultPlatform?: string;

  @IsOptional()
  @IsEnum(["2h", "6h", "12h", "24h"])
  approvalDeadlineOffset?: string;
}
