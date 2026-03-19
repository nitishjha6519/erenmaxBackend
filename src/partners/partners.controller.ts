import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PartnersService } from './partners.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserDocument } from '../users/schemas/user.schema';

@Controller('api/partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  getPartners(
    @CurrentUser() user: UserDocument,
    @Query('limit') limit = '20',
    @Query('offset') offset = '0',
  ) {
    return this.partnersService.getPartners(user, parseInt(limit), parseInt(offset));
  }
}
