import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ default: null })
  avatar: string;

  @Prop({ default: null })
  bio: string;

  @Prop({ default: 50, min: 0, max: 100 })
  trustScore: number;

  @Prop({ default: 500 })
  totalPoints: number;

  @Prop({ default: 100, min: 0, max: 100 })
  showRate: number;

  @Prop({ default: 0 })
  sessionsCompleted: number;

  @Prop({ default: 0 })
  goalsPosted: number;

  @Prop({ default: 0 })
  goalsHelped: number;

  @Prop({ default: 0 })
  streak: number;

  @Prop({ default: 0 })
  longestStreak: number;

  @Prop({ type: [String], default: [] })
  badges: string[];

  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
