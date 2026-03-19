import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TrustScoreLogDocument = TrustScoreLog & Document;

export enum TrustScoreAction {
  SESSION_COMPLETED = 'session_completed',
  GOOD_FEEDBACK = 'good_feedback',
  STREAK_BONUS = 'streak_bonus',
  NO_SHOW = 'no_show',
  LATE_CANCEL = 'late_cancel',
}

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class TrustScoreLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(TrustScoreAction) })
  action: string;

  @Prop({ required: true })
  pointsChange: number;

  @Prop({ required: true })
  description: string;

  @Prop({ type: Types.ObjectId, ref: 'Session', default: null })
  sessionId: Types.ObjectId;

  createdAt: Date;
}

export const TrustScoreLogSchema = SchemaFactory.createForClass(TrustScoreLog);
