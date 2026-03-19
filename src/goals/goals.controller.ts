import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { GoalsService } from "./goals.service";
import { CreateGoalDto } from "./dto/create-goal.dto";
import { UpdateGoalDto } from "./dto/update-goal.dto";
import { CreateGoalSessionDto } from "./dto/create-goal-session.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { UserDocument } from "../users/schemas/user.schema";

@Controller("api/goals")
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: UserDocument, @Body() dto: CreateGoalDto) {
    return this.goalsService.create(user, dto);
  }

  @Get("my")
  @UseGuards(JwtAuthGuard)
  getMyGoals(
    @CurrentUser() user: UserDocument,
    @Query("status") status = "all",
    @Query("limit") limit = "20",
    @Query("offset") offset = "0",
  ) {
    return this.goalsService.getMyGoals(
      user._id.toString(),
      status,
      parseInt(limit),
      parseInt(offset),
    );
  }

  @Get()
  findAll(@Query() query: any) {
    return this.goalsService.findAll(query);
  }

  @Get(":goalId")
  findOne(@Param("goalId") goalId: string, @Query("userId") userId?: string) {
    return this.goalsService.findOne(goalId, userId);
  }

  @Patch(":goalId")
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: UserDocument,
    @Param("goalId") goalId: string,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.goalsService.update(user, goalId, dto);
  }

  @Post(":goalId/sessions")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  createGoalSession(
    @CurrentUser() user: UserDocument,
    @Param("goalId") goalId: string,
    @Body() dto: CreateGoalSessionDto,
  ) {
    return this.goalsService.createGoalSession(user, goalId, dto);
  }

  @Delete(":goalId")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: UserDocument, @Param("goalId") goalId: string) {
    return this.goalsService.remove(user, goalId);
  }
}
