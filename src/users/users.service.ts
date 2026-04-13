import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { User, UserDocument } from "./schemas/user.schema";
import {
  TrustScoreLog,
  TrustScoreLogDocument,
} from "./schemas/trust-score-log.schema";
import { UpdateUserDto } from "./dto/update-user.dto";
import { Session, SessionDocument } from "../sessions/schemas/session.schema";
import {
  Application,
  ApplicationDocument,
} from "../applications/schemas/application.schema";
import { Goal, GoalDocument } from "../goals/schemas/goal.schema";

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(TrustScoreLog.name)
    private trustLogModel: Model<TrustScoreLogDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @InjectModel(Application.name)
    private applicationModel: Model<ApplicationDocument>,
    @InjectModel(Goal.name) private goalModel: Model<GoalDocument>,
  ) {}

  async getPublicProfile(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException("User not found");
    return {
      user: {
        id: user._id,
        name: user.name,
        avatar: user.avatar || null,
        bio: user.bio || null,
        trustScore: user.trustScore,
        showRate: user.showRate,
        sessionsCompleted: user.sessionsCompleted,
        goalsPosted: user.goalsPosted,
        goalsHelped: user.goalsHelped,
        badges: user.badges,
        createdAt: user.createdAt,
      },
    };
  }

  async updateMe(user: UserDocument, dto: UpdateUserDto) {
    const updated = await this.userModel
      .findByIdAndUpdate(user._id, { $set: dto }, { new: true })
      .exec();
    return { user: updated };
  }

  async getMyStats(user: UserDocument) {
    const userId = user._id as Types.ObjectId;

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const sessionsThisWeek = await this.sessionModel.countDocuments({
      $or: [
        { goalOwnerId: userId },
        { approvedHelperId: userId },
        { partnerId: userId },
      ],
      status: "completed",
      completedAt: { $gte: weekStart },
    });

    const allSessions = await this.sessionModel.find({
      $or: [
        { goalOwnerId: userId },
        { approvedHelperId: userId },
        { partnerId: userId },
      ],
      status: "completed",
    });

    const totalMinutes = allSessions.reduce(
      (sum, s) => sum + (s.duration || 0),
      0,
    );
    const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

    const ratings = allSessions
      .map((s) => {
        const isOwner = s.goalOwnerId.toString() === userId.toString();
        return isOwner ? s.goalOwnerRating : s.partnerRating;
      })
      .filter((r) => r != null);
    const avgRating =
      ratings.length > 0
        ? Math.round(
            (ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10,
          ) / 10
        : 0;

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weeklyMap: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      weeklyMap[dayNames[d.getDay()]] = 0;
    }
    for (const s of allSessions) {
      if (s.completedAt && s.completedAt >= weekStart) {
        const day = dayNames[s.completedAt.getDay()];
        if (weeklyMap[day] !== undefined) weeklyMap[day]++;
      }
    }
    const weeklyActivity = Object.entries(weeklyMap).map(([day, sessions]) => ({
      day,
      sessions,
    }));

    const categoryAgg = await this.sessionModel.aggregate([
      {
        $match: {
          $or: [
            { goalOwnerId: userId },
            { approvedHelperId: userId },
            { partnerId: userId },
          ],
          status: "completed",
        },
      },
      {
        $lookup: {
          from: "goals",
          localField: "goalId",
          foreignField: "_id",
          as: "goal",
        },
      },
      { $unwind: "$goal" },
      { $group: { _id: "$goal.category", count: { $sum: 1 } } },
    ]);
    const categoryBreakdown = categoryAgg.map((c) => ({
      category: c._id,
      count: c.count,
    }));

    // Points locked in pending applications
    const stakedResult = await this.applicationModel.aggregate([
      { $match: { applicantId: userId, status: "pending" } },
      { $group: { _id: null, total: { $sum: "$stakedPoints" } } },
    ]);
    const stakedPoints = stakedResult.length > 0 ? stakedResult[0].total : 0;

    // Active (open) goal for this user — there can be at most one
    const openGoal = await this.goalModel.findOne({
      userId,
      status: { $nin: ["cancelled", "completed"] },
    }).select("_id title status pledgedPoints startDate endDate").lean().exec();

    // Count completed sessions for the open goal
    let openGoalCompletedSessions = 0;
    if (openGoal) {
      openGoalCompletedSessions = await this.sessionModel.countDocuments({
        goalId: openGoal._id,
        status: "completed",
      });
    }

    // Build score breakdown from trust log
    const trustLogs = await this.trustLogModel.find({ userId }).exec();
    let sessionsPoints = 0;
    let feedbackPoints = 0;
    let streakPoints = 0;
    let missedPenalty = 0;
    let missedCount = 0;
    for (const log of trustLogs) {
      if (log.action === "session_completed")
        sessionsPoints += log.pointsChange;
      else if (log.action === "good_feedback")
        feedbackPoints += log.pointsChange;
      else if (log.action === "streak_bonus") streakPoints += log.pointsChange;
      else if (log.action === "no_show" || log.action === "late_cancel") {
        missedPenalty += log.pointsChange;
        missedCount++;
      }
    }

    return {
      stats: {
        trustScore: user.trustScore,
        totalPoints: user.totalPoints,
        stakedPoints,
        showRate: user.showRate,
        sessionsCompleted: user.sessionsCompleted,
        sessionsThisWeek,
        goalsPosted: user.goalsPosted,
        goalsHelped: user.goalsHelped,
        currentStreak: user.streak,
        longestStreak: user.longestStreak,
        totalHoursSpent: totalHours,
        averageRating: avgRating,
      },
      openGoal: openGoal
        ? {
            id: openGoal._id,
            title: (openGoal as any).title,
            status: (openGoal as any).status,
            pledgedPoints: (openGoal as any).pledgedPoints,
            startDate: (openGoal as any).startDate,
            endDate: (openGoal as any).endDate,
            completedSessions: openGoalCompletedSessions,
            targetSessions: 100,
            progressPercent: Math.min(
              Math.round((openGoalCompletedSessions / 100) * 100),
              100,
            ),
          }
        : null,
      scoreBreakdown: {
        sessionsPoints,
        feedbackPoints,
        streakPoints,
        missedPenalty,
        missedCount,
      },
      weeklyActivity,
      categoryBreakdown,
    };
  }

  async getTrustScoreHistory(userId: string, limit: number, offset: number) {
    const [history, total] = await Promise.all([
      this.trustLogModel
        .find({ userId: new Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .exec(),
      this.trustLogModel.countDocuments({ userId: new Types.ObjectId(userId) }),
    ]);

    return {
      history: history.map((h) => ({
        id: h._id,
        action: h.action,
        pointsChange: h.pointsChange,
        description: h.description,
        createdAt: h.createdAt,
      })),
      total,
    };
  }

  async recalculateTrustScore(userId: Types.ObjectId): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user) return;

    const showRate = user.showRate || 0;
    const sessions = user.sessionsCompleted || 0;
    const streak = user.streak || 0;

    const allSessions = await this.sessionModel.find({
      $or: [
        { goalOwnerId: userId },
        { approvedHelperId: userId },
        { partnerId: userId },
      ],
      status: "completed",
    });
    const ratings = allSessions
      .map((s) =>
        s.goalOwnerId.toString() === userId.toString()
          ? s.goalOwnerRating
          : s.partnerRating,
      )
      .filter((r) => r != null);
    const avgRating =
      ratings.length > 0
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : 0;

    const trustScore = Math.min(
      100,
      Math.round(
        showRate * 0.4 +
          avgRating * 10 +
          Math.min(sessions * 0.5, 20) +
          Math.min(streak, 10),
      ),
    );

    await this.userModel.findByIdAndUpdate(userId, { $set: { trustScore } });
  }
}
