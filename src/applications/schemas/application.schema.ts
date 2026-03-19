import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ApplicationDocument = Application & Document;

export enum ApplicationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
}

@Schema({ timestamps: true })
export class Application {
  /** The specific session slot this application is for */
  @Prop({ type: Types.ObjectId, ref: 'Session', required: true })
  sessionId: Types.ObjectId;

  /** Convenience denormalized reference — copied from session.goalId */
  @Prop({ type: Types.ObjectId, ref: 'Goal', default: null })
  goalId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  applicantId: Types.ObjectId;

  @Prop({ default: null })
  message: string;

  @Prop({ required: true, min: 0 })
  stakedPoints: number;

  @Prop({
    default: ApplicationStatus.PENDING,
    enum: Object.values(ApplicationStatus),
  })
  status: string;

  createdAt: Date;
  updatedAt: Date;
}

export const ApplicationSchema = SchemaFactory.createForClass(Application);
/** One application per person per session slot */
ApplicationSchema.index({ sessionId: 1, applicantId: 1 }, { unique: true });
