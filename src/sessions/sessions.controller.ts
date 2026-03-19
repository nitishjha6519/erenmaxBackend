import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { CompleteSessionDto } from './dto/complete-session.dto';
import { CancelSessionDto } from './dto/cancel-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserDocument } from '../users/schemas/user.schema';

@Controller('api/sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  /** Public — powers landing page "open slots right now" feed */
  @Get('open')
  getOpenSessions(
    @Query('category') category?: string,
    @Query('from') from?: string,
    @Query('limit') limit = '20',
    @Query('offset') offset = '0',
  ) {
    return this.sessionsService.getOpenSessions(
      category,
      from,
      parseInt(limit),
      parseInt(offset),
    );
  }

  /** Returns the current user's upcoming (approved/scheduled) + ongoing (in_progress) sessions */
  @Get('upcoming')
  @UseGuards(JwtAuthGuard)
  getUpcomingSessions(
    @CurrentUser() user: UserDocument,
    @Query('role') role = 'all',
    @Query('limit') limit = '20',
    @Query('offset') offset = '0',
  ) {
    return this.sessionsService.getSessions(
      user,
      'upcoming',
      role,
      parseInt(limit),
      parseInt(offset),
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  getSessions(
    @CurrentUser() user: UserDocument,
    @Query('type') type = 'all',
    @Query('role') role = 'all',
    @Query('status') status?: string,
    @Query('limit') limit = '20',
    @Query('offset') offset = '0',
  ) {
    return this.sessionsService.getSessions(
      user,
      type,
      role,
      parseInt(limit),
      parseInt(offset),
      status,
    );
  }

  @Get(':sessionId')
  @UseGuards(JwtAuthGuard)
  getSession(@CurrentUser() user: UserDocument, @Param('sessionId') sessionId: string) {
    return this.sessionsService.getSession(user, sessionId);
  }

  /** Public — check if a session is currently live and get its details */
  @Get(':sessionId/live')
  getSessionLiveStatus(@Param('sessionId') sessionId: string) {
    return this.sessionsService.getSessionLiveStatus(sessionId);
  }

  @Patch(':sessionId')
  @UseGuards(JwtAuthGuard)
  updateSession(
    @CurrentUser() user: UserDocument,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessionsService.updateSession(user, sessionId, dto);
  }

  @Post(':sessionId/start')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  startSession(@CurrentUser() user: UserDocument, @Param('sessionId') sessionId: string) {
    return this.sessionsService.startSession(user, sessionId);
  }

  @Post(':sessionId/complete')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  completeSession(
    @CurrentUser() user: UserDocument,
    @Param('sessionId') sessionId: string,
    @Body() dto: CompleteSessionDto,
  ) {
    return this.sessionsService.completeSession(user, sessionId, dto);
  }

  @Post(':sessionId/cancel')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  cancelSession(
    @CurrentUser() user: UserDocument,
    @Param('sessionId') sessionId: string,
    @Body() dto: CancelSessionDto,
  ) {
    return this.sessionsService.cancelSession(user, sessionId, dto);
  }
}
