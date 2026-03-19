import { IsOptional, IsString, IsNumber, Min } from "class-validator";

export class CreateApplicationDto {
  @IsOptional()
  @IsString()
  message?: string;

  @IsNumber()
  @Min(0)
  stakedPoints: number;
}
