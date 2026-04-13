import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type SessionDocument = Session & Document;

export enum SessionStatus {
  OPEN = "open",
  PENDING_APPROVAL = "pending_approval",
  APPROVED = "approved",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  DESERTED = "deserted",
  // Legacy values kept for backward compat
  SCHEDULED = "scheduled",
  NO_SHOW = "no-show",
}

@Schema({ timestamps: true })
export class Session {
  @Prop({ type: Types.ObjectId, ref: "Goal", required: true })
  goalId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  goalOwnerId: Types.ObjectId;

  /** Nullable until an application is approved for this slot */
  @Prop({ type: Types.ObjectId, ref: "User", default: null })
  approvedHelperId: Types.ObjectId;

  /** Legacy field — kept for backward compat with old session docs */
  @Prop({ type: Types.ObjectId, ref: "User", default: null })
  partnerId: Types.ObjectId;

  @Prop({ default: null })
  approvedAt: Date;

  @Prop({ required: true })
  scheduledAt: Date;

  @Prop({ default: 45 })
  duration: number;

  /** Computed: scheduledAt + duration minutes. Used for ongoing-session detection. */
  @Prop({ default: null })
  endsAt: Date;

  @Prop({ default: null })
  meetingLink: string;

  @Prop({
    default: SessionStatus.OPEN,
    enum: Object.values(SessionStatus),
  })
  status: string;

  @Prop({ required: true })
  topic: string;

  @Prop({ required: true })
  sessionCategory: string;

  @Prop({ default: null })
  notes: string;

  @Prop({ default: null, min: 1, max: 5 })
  goalOwnerRating: number;

  @Prop({ default: null, min: 1, max: 5 })
  partnerRating: number;

  @Prop({ default: null })
  goalOwnerFeedback: string;

  @Prop({ default: null })
  partnerFeedback: string;

  @Prop({ default: null })
  goalOwnerShowedUp: boolean;

  @Prop({ default: null })
  partnerShowedUp: boolean;

  @Prop({ default: null })
  completedAt: Date;

  @Prop({ default: null })
  approvalDeadline: Date;

  /** Points staked by the goal owner when creating this session slot */
  @Prop({ default: 0 })
  ownerStakedPoints: number;

  /** False once scheduledAt has elapsed by more than 10 minutes — no new applications accepted */
  @Prop({ default: true })
  applicationOpen: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const SessionSchema = SchemaFactory.createForClass(Session);
