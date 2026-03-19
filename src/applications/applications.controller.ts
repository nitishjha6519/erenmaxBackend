import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserDocument } from '../users/schemas/user.schema';

@Controller('api')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post('sessions/:sessionId/applications')
  @UseGuards(JwtAuthGuard)
  applyToSession(
    @CurrentUser() user: UserDocument,
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateApplicationDto,
  ) {
    return this.applicationsService.applyToSession(user, sessionId, dto);
  }

  @Get('goals/:goalId/applications')
  @UseGuards(JwtAuthGuard)
  getGoalApplications(
    @CurrentUser() user: UserDocument,
    @Param('goalId') goalId: string,
  ) {
    return this.applicationsService.getGoalApplications(user, goalId);
  }

  @Post('applications/:applicationId/approve')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() user: UserDocument,
    @Param('applicationId') applicationId: string,
  ) {
    return this.applicationsService.approve(user, applicationId);
  }

  @Post('applications/:applicationId/reject')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() user: UserDocument,
    @Param('applicationId') applicationId: string,
  ) {
    return this.applicationsService.reject(user, applicationId);
  }

  @Delete('applications/:applicationId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  withdraw(
    @CurrentUser() user: UserDocument,
    @Param('applicationId') applicationId: string,
  ) {
    return this.applicationsService.withdraw(user, applicationId);
  }

  @Get('applications/my')
  @UseGuards(JwtAuthGuard)
  getMyApplications(
    @CurrentUser() user: UserDocument,
    @Query('type') type = 'all',
    @Query('status') status = 'all',
  ) {
    return this.applicationsService.getMyApplications(user._id.toString(), type, status);
  }
}
