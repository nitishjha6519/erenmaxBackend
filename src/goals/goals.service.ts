import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Goal, GoalDocument, GoalStatus } from "./schemas/goal.schema";
import {
  Application,
  ApplicationDocument,
} from "../applications/schemas/application.schema";
import { User, UserDocument } from "../users/schemas/user.schema";
import {
  Session,
  SessionDocument,
  SessionStatus,
} from "../sessions/schemas/session.schema";
import { CreateGoalDto } from "./dto/create-goal.dto";
import { UpdateGoalDto } from "./dto/update-goal.dto";

@Injectable()
export class GoalsService {
  constructor(
    @InjectModel(Goal.name) private goalModel: Model<GoalDocument>,
    @InjectModel(Application.name)
    private applicationModel: Model<ApplicationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
  ) {}

  async create(user: UserDocument, dto: CreateGoalDto) {
    if (user.totalPoints < dto.pledgedPoints) {
      throw new BadRequestException("Insufficient points to pledge");
    }

    const goal = await this.goalModel.create({
      userId: user._id,
      title: dto.title,
      description: dto.description,
      category: dto.category,
      difficulty: dto.difficulty,
      pledgedPoints: dto.pledgedPoints,
      defaultDurationMins: dto.defaultDurationMins ?? 45,
      defaultPlatform: dto.defaultPlatform ?? "Google Meet",
      approvalDeadlineOffset: dto.approvalDeadlineOffset ?? "6h",
      status: GoalStatus.OPEN,
      applicationsOpen: true,
    });

    await this.userModel.findByIdAndUpdate(user._id, {
      $inc: { totalPoints: -dto.pledgedPoints, goalsPosted: 1 },
    });

    return { goal };
  }

  async findAll(query: {
    category?: string;
    difficulty?: string;
    search?: string;
    status?: string;
    sortBy?: string;
    has_open_slots?: string;
    limit?: string;
    offset?: string;
  }) {
    const filter: any = {};
    filter.status = query.status || GoalStatus.OPEN;
    if (query.category) filter.category = query.category;
    if (query.difficulty) filter.difficulty = query.difficulty;
    if (query.search) {
      filter.$text = { $search: query.search };
    }

    let sort: any = { createdAt: -1 };
    if (query.sortBy === "points") sort = { pledgedPoints: -1 };

    const limit = parseInt(query.limit || "20");
    const offset = parseInt(query.offset || "0");

    const [goals, total] = await Promise.all([
      this.goalModel
        .find(filter)
        .sort(sort)
        .skip(offset)
        .limit(limit)
        .populate("userId", "name avatar trustScore")
        .exec(),
      this.goalModel.countDocuments(filter),
    ]);

    const goalIds = goals.map((g) => g._id);
    const [appCounts, openSlotCounts] = await Promise.all([
      this.applicationModel.aggregate([
        { $match: { goalId: { $in: goalIds }, status: "pending" } },
        { $group: { _id: "$goalId", count: { $sum: 1 } } },
      ]),
      this.sessionModel.aggregate([
        { $match: { goalId: { $in: goalIds }, status: SessionStatus.OPEN } },
        { $group: { _id: "$goalId", count: { $sum: 1 } } },
      ]),
    ]);

    const countMap = appCounts.reduce(
      (acc, c) => {
        acc[c._id.toString()] = c.count;
        return acc;
      },
      {} as Record<string, number>,
    );
    const slotCountMap = openSlotCounts.reduce(
      (acc, c) => {
        acc[c._id.toString()] = c.count;
        return acc;
      },
      {} as Record<string, number>,
    );

    let result = goals.map((g) => {
      const u = g.userId as any;
      return {
        id: g._id,
        title: g.title,
        description: g.description,
        category: g.category,
        difficulty: g.difficulty,
        pledgedPoints: g.pledgedPoints,
        status: g.status,
        applicationsOpen: g.applicationsOpen,
        defaultDurationMins: (g as any).defaultDurationMins,
        defaultPlatform: (g as any).defaultPlatform,
        applicationCount: countMap[g._id.toString()] || 0,
        openSlotCount: slotCountMap[g._id.toString()] || 0,
        createdAt: g.createdAt,
        user: {
          id: u._id,
          name: u.name,
          avatar: u.avatar || null,
          trustScore: u.trustScore,
        },
      };
    });

    if (query.has_open_slots === "true") {
      result = result.filter((g) => g.openSlotCount > 0);
    }

    return {
      goals: result,
      total,
      hasMore: offset + limit < total,
    };
  }

  async findOne(goalId: string, currentUserId?: string) {
    const goal = await this.goalModel
      .findById(goalId)
      .populate("userId", "name avatar trustScore showRate sessionsCompleted")
      .exec();
    if (!goal) throw new NotFoundException("Goal not found");

    const appCount = await this.applicationModel.countDocuments({
      goalId: goal._id,
      status: "pending",
    });

    let userApplication = null;
    if (currentUserId) {
      const app = await this.applicationModel.findOne({
        goalId: goal._id,
        applicantId: new Types.ObjectId(currentUserId),
      });
      if (app)
        userApplication = {
          id: app._id,
          status: app.status,
          sessionId: app.sessionId,
        };
    }

    // Fetch all session slots for this goal
    const sessions = await this.sessionModel.find({ goalId: goal._id }).exec();

    // Resolve approvedHelper names for sessions that have one
    const helperIds = sessions
      .filter((s) => s.approvedHelperId)
      .map((s) => s.approvedHelperId);
    const helpers = helperIds.length
      ? await this.userModel
          .find({ _id: { $in: helperIds } })
          .select("name avatar trustScore")
          .exec()
      : [];
    const helperMap = helpers.reduce(
      (acc, h) => {
        acc[h._id.toString()] = h;
        return acc;
      },
      {} as Record<string, any>,
    );

    // Application counts per session
    const sessionIds = sessions.map((s) => s._id);
    const sessionAppCounts = sessionIds.length
      ? await this.applicationModel.aggregate([
          { $match: { sessionId: { $in: sessionIds }, status: "pending" } },
          { $group: { _id: "$sessionId", count: { $sum: 1 } } },
        ])
      : [];
    const sessionAppMap = sessionAppCounts.reduce(
      (acc, c) => {
        acc[c._id.toString()] = c.count;
        return acc;
      },
      {} as Record<string, number>,
    );

    const goalOwner = goal.userId as any;
    return {
      goal: {
        id: goal._id,
        title: goal.title,
        description: goal.description,
        category: goal.category,
        difficulty: goal.difficulty,
        pledgedPoints: goal.pledgedPoints,
        status: goal.status,
        applicationsOpen: goal.applicationsOpen,
        defaultDurationMins: (goal as any).defaultDurationMins,
        defaultPlatform: (goal as any).defaultPlatform,
        approvalDeadlineOffset: (goal as any).approvalDeadlineOffset,
        applicationCount: appCount,
        openSlotCount: sessions.filter((s) => s.status === SessionStatus.OPEN)
          .length,
        createdAt: goal.createdAt,
        sessions: sessions.map((s) => {
          const helperId = s.approvedHelperId?.toString();
          const helper = helperId ? helperMap[helperId] : null;
          return {
            id: s._id,
            topic: s.topic,
            category: s.sessionCategory,
            status: s.status,
            scheduledAt: s.scheduledAt,
            duration: s.duration,
            meetingLink: s.meetingLink || null,
            approvalDeadline: s.approvalDeadline || null,
            approvedHelper: helper
              ? {
                  id: helper._id,
                  name: helper.name,
                  avatar: helper.avatar || null,
                  trustScore: helper.trustScore,
                }
              : null,
            appCount: sessionAppMap[s._id.toString()] || 0,
          };
        }),
        user: {
          id: goalOwner._id,
          name: goalOwner.name,
          avatar: goalOwner.avatar || null,
          trustScore: goalOwner.trustScore,
          showRate: goalOwner.showRate,
          sessionsCompleted: goalOwner.sessionsCompleted,
        },
      },
      userApplication,
    };
  }

  async update(user: UserDocument, goalId: string, dto: UpdateGoalDto) {
    const goal = await this.goalModel.findById(goalId);
    if (!goal) throw new NotFoundException("Goal not found");
    if (goal.userId.toString() !== user._id.toString()) {
      throw new ForbiddenException("Not the owner of this goal");
    }

    const updated = await this.goalModel
      .findByIdAndUpdate(goalId, { $set: dto }, { new: true })
      .exec();
    return { goal: updated };
  }

  async remove(user: UserDocument, goalId: string) {
    const goal = await this.goalModel.findById(goalId);
    if (!goal) throw new NotFoundException("Goal not found");
    if (goal.userId.toString() !== user._id.toString()) {
      throw new ForbiddenException("Not the owner of this goal");
    }

    const approvedApp = await this.applicationModel.findOne({
      goalId: goal._id,
      status: "approved",
    });
    if (approvedApp) {
      throw new BadRequestException(
        "Cannot delete a goal with an approved application",
      );
    }

    await this.goalModel.findByIdAndUpdate(goalId, {
      $set: { status: GoalStatus.CANCELLED },
    });

    const pendingApps = await this.applicationModel.find({
      goalId: goal._id,
      status: "pending",
    });
    for (const app of pendingApps) {
      await this.userModel.findByIdAndUpdate(app.applicantId, {
        $inc: { totalPoints: app.stakedPoints },
      });
      await this.applicationModel.findByIdAndUpdate(app._id, {
        $set: { status: "rejected" },
      });
    }

    await this.userModel.findByIdAndUpdate(user._id, {
      $inc: { totalPoints: goal.pledgedPoints },
    });

    return { message: "Goal deleted successfully" };
  }

  async createGoalSession(
    user: UserDocument,
    goalId: string,
    dto: {
      topic: string;
      category: string;
      scheduledDate: string;
      durationMins?: number;
      platform?: string;
      meetingLink?: string;
    },
  ) {
    const goal = await this.goalModel.findById(goalId);
    if (!goal) throw new NotFoundException("Goal not found");
    if (goal.userId.toString() !== user._id.toString()) {
      throw new ForbiddenException("Not the owner of this goal");
    }

    const scheduledAt = new Date(dto.scheduledDate);
    const offsetHours: Record<string, number> = {
      "2h": 2,
      "6h": 6,
      "12h": 12,
      "24h": 24,
    };
    const offsetKey = (goal as any).approvalDeadlineOffset || "6h";
    const hoursBack = offsetHours[offsetKey] ?? 6;
    const approvalDeadline = new Date(
      scheduledAt.getTime() - hoursBack * 60 * 60 * 1000,
    );

    const duration =
      dto.durationMins ?? (goal as any).defaultDurationMins ?? 45;
    const meetingLink = dto.meetingLink ?? null;
    const endsAt = new Date(scheduledAt.getTime() + duration * 60 * 1000);

    // Always create a fresh session slot — never upsert
    const session = await this.sessionModel.create({
      goalId: goal._id,
      goalOwnerId: user._id,
      approvedHelperId: null,
      scheduledAt,
      endsAt,
      duration,
      meetingLink,
      approvalDeadline,
      topic: dto.topic,
      sessionCategory: dto.category,
      status: SessionStatus.OPEN,
    });

    return {
      session: {
        id: session._id,
        topic: session.topic,
        category: session.sessionCategory,
        scheduledAt: session.scheduledAt,
        endsAt: session.endsAt,
        approvalDeadline: session.approvalDeadline,
        duration: session.duration,
        meetingLink: session.meetingLink || null,
        status: session.status,
      },
    };
  }

  async getMyGoals(
    userId: string,
    status: string,
    limit: number,
    offset: number,
  ) {
    const filter: any = { userId: new Types.ObjectId(userId) };
    if (status && status !== "all") filter.status = status;

    const [goals, total] = await Promise.all([
      this.goalModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .exec(),
      this.goalModel.countDocuments(filter),
    ]);

    const goalIds = goals.map((g) => g._id);
    const [appCounts, openSlotCounts] = await Promise.all([
      this.applicationModel.aggregate([
        { $match: { goalId: { $in: goalIds }, status: "pending" } },
        { $group: { _id: "$goalId", count: { $sum: 1 } } },
      ]),
      this.sessionModel.aggregate([
        { $match: { goalId: { $in: goalIds }, status: SessionStatus.OPEN } },
        { $group: { _id: "$goalId", count: { $sum: 1 } } },
      ]),
    ]);
    const countMap = appCounts.reduce(
      (acc, c) => {
        acc[c._id.toString()] = c.count;
        return acc;
      },
      {} as Record<string, number>,
    );
    const slotCountMap = openSlotCounts.reduce(
      (acc, c) => {
        acc[c._id.toString()] = c.count;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      goals: goals.map((g) => ({
        ...g.toObject(),
        applicationCount: countMap[g._id.toString()] || 0,
        openSlotCount: slotCountMap[g._id.toString()] || 0,
      })),
      total,
    };
  }
}
