import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { Session, SessionSchema } from './schemas/session.schema';
import { Goal, GoalSchema } from '../goals/schemas/goal.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { TrustScoreLog, TrustScoreLogSchema } from '../users/schemas/trust-score-log.schema';
import { Application, ApplicationSchema } from '../applications/schemas/application.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Session.name, schema: SessionSchema },
      { name: Goal.name, schema: GoalSchema },
      { name: User.name, schema: UserSchema },
      { name: TrustScoreLog.name, schema: TrustScoreLogSchema },
      { name: Application.name, schema: ApplicationSchema },
    ]),
  ],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService, MongooseModule],
})
export class SessionsModule {}
