import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { GoalsController } from "./goals.controller";
import { GoalsService } from "./goals.service";
import { Goal, GoalSchema } from "./schemas/goal.schema";
import {
  Application,
  ApplicationSchema,
} from "../applications/schemas/application.schema";
import { User, UserSchema } from "../users/schemas/user.schema";
import { Session, SessionSchema } from "../sessions/schemas/session.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Goal.name, schema: GoalSchema },
      { name: Application.name, schema: ApplicationSchema },
      { name: User.name, schema: UserSchema },
      { name: Session.name, schema: SessionSchema },
    ]),
  ],
  controllers: [GoalsController],
  providers: [GoalsService],
  exports: [GoalsService, MongooseModule],
})
export class GoalsModule {}
