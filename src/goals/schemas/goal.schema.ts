import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type GoalDocument = Goal & Document;

export enum GoalCategory {
  DSA = "dsa",
  SYSTEM_DESIGN = "system-design",
  BEHAVIORAL = "behavioral",
  FITNESS = "fitness",
  SPEAKING = "speaking",
  OTHER = "other",
}

export enum GoalDifficulty {
  BEGINNER = "beginner",
  INTERMEDIATE = "intermediate",
  ADVANCED = "advanced",
}

export enum GoalStatus {
  OPEN = "open",
  MATCHED = "matched",
  IN_PROGRESS = "in-progress",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

@Schema({ timestamps: true })
export class Goal {
  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true, enum: Object.values(GoalCategory) })
  category: string;

  @Prop({ required: true, enum: Object.values(GoalDifficulty) })
  difficulty: string;

  @Prop({ required: true, min: 10 })
  pledgedPoints: number;

  @Prop({ default: GoalStatus.OPEN, enum: Object.values(GoalStatus) })
  status: string;

  @Prop({ default: true })
  applicationsOpen: boolean;

  @Prop({ default: null })
  maxApplicants: number;

  /** Copied onto each new session slot if not overridden in the request */
  @Prop({ default: 45 })
  defaultDurationMins: number;

  @Prop({ default: "Google Meet" })
  defaultPlatform: string;

  @Prop({ default: "6h", enum: ["2h", "6h", "12h", "24h"] })
  approvalDeadlineOffset: string;

  createdAt: Date;
  updatedAt: Date;
}

export const GoalSchema = SchemaFactory.createForClass(Goal);
GoalSchema.index({ status: 1, category: 1 });
GoalSchema.index({ title: "text", description: "text" });
