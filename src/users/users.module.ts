import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { User, UserSchema } from "./schemas/user.schema";
import {
  TrustScoreLog,
  TrustScoreLogSchema,
} from "./schemas/trust-score-log.schema";
import { Session, SessionSchema } from "../sessions/schemas/session.schema";
import {
  Application,
  ApplicationSchema,
} from "../applications/schemas/application.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: TrustScoreLog.name, schema: TrustScoreLogSchema },
      { name: Session.name, schema: SessionSchema },
      { name: Application.name, schema: ApplicationSchema },
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService, MongooseModule],
})
export class UsersModule {}
