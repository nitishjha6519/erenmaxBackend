import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsDateString,
  Min,
} from "class-validator";
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
  @Min(50)
  pledgedPoints: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  defaultDurationMins?: number;

  @IsOptional()
  @IsString()
  defaultPlatform?: string;
}
