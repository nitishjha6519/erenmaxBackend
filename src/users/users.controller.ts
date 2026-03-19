import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserDocument } from './schemas/user.schema';

@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me/stats')
  @UseGuards(JwtAuthGuard)
  getMyStats(@CurrentUser() user: UserDocument) {
    return this.usersService.getMyStats(user);
  }

  @Get('me/trust-score-history')
  @UseGuards(JwtAuthGuard)
  getTrustHistory(
    @CurrentUser() user: UserDocument,
    @Query('limit') limit = '20',
    @Query('offset') offset = '0',
  ) {
    return this.usersService.getTrustScoreHistory(
      user._id.toString(),
      parseInt(limit),
      parseInt(offset),
    );
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(@CurrentUser() user: UserDocument, @Body() dto: UpdateUserDto) {
    return this.usersService.updateMe(user, dto);
  }

  @Get(':userId')
  getPublicProfile(@Param('userId') userId: string) {
    return this.usersService.getPublicProfile(userId);
  }
}
