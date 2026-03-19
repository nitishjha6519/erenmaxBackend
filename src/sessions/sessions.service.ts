import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  Session,
  SessionDocument,
  SessionStatus,
} from "./schemas/session.schema";
import { Goal, GoalDocument, GoalStatus } from "../goals/schemas/goal.schema";
import { User, UserDocument } from "../users/schemas/user.schema";
import {
  TrustScoreLog,
  TrustScoreLogDocument,
  TrustScoreAction,
} from "../users/schemas/trust-score-log.schema";
import { CompleteSessionDto } from "./dto/complete-session.dto";
import { CancelSessionDto } from "./dto/cancel-session.dto";
import { UpdateSessionDto } from "./dto/update-session.dto";
import {
  Application,
  ApplicationDocument,
} from "../applications/schemas/application.schema";

@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @InjectModel(Goal.name) private goalModel: Model<GoalDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(TrustScoreLog.name)
    private trustLogModel: Model<TrustScoreLogDocument>,
    @InjectModel(Application.name)
    private applicationModel: Model<ApplicationDocument>,
  ) {}

  /** Returns the approved helper for a session, checking both new and legacy fields */
  private getHelperId(session: SessionDocument): Types.ObjectId | null {
    return (
      (session.approvedHelperId as any) || (session.partnerId as any) || null
    );
  }

  async getOpenSessions(
    category?: string,
    from?: string,
    limit = 20,
    offset = 0,
  ) {
    const filter: any = { status: SessionStatus.OPEN };
    if (category) filter.sessionCategory = category;
    if (from) filter.scheduledAt = { $gte: new Date(from) };

    const [sessions, total] = await Promise.all([
      this.sessionModel
        .find(filter)
        .sort({ scheduledAt: 1 })
        .skip(offset)
        .limit(limit)
        .populate("goalId", "title category difficulty pledgedPoints userId")
        .exec(),
      this.sessionModel.countDocuments(filter),
    ]);

    const ownerIds = sessions.map((s) => s.goalOwnerId);
    const owners = await this.userModel
      .find({ _id: { $in: ownerIds } })
      .select("name avatar trustScore")
      .exec();
    const ownerMap = owners.reduce(
      (acc, o) => {
        acc[o._id.toString()] = o;
        return acc;
      },
      {} as Record<string, any>,
    );

    const sessionIds = sessions.map((s) => s._id);
    const appCounts = await this.applicationModel.aggregate([
      { $match: { sessionId: { $in: sessionIds }, status: "pending" } },
      { $group: { _id: "$sessionId", count: { $sum: 1 } } },
    ]);
    const appCountMap = appCounts.reduce(
      (acc, c) => {
        acc[c._id.toString()] = c.count;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      sessions: sessions.map((s) => {
        const goal = s.goalId as any;
        const owner = ownerMap[s.goalOwnerId.toString()];
        return {
          id: s._id,
          topic: s.topic,
          category: s.sessionCategory,
          scheduledAt: s.scheduledAt,
          duration: s.duration,
          meetingLink: s.meetingLink || null,
          approvalDeadline: s.approvalDeadline || null,
          status: s.status,
          applicationCount: appCountMap[s._id.toString()] || 0,
          goal: goal
            ? {
                id: goal._id,
                title: goal.title,
                category: goal.category,
                difficulty: goal.difficulty,
                pledgedPoints: goal.pledgedPoints,
              }
            : null,
          owner: owner
            ? {
                id: owner._id,
                name: owner.name,
                avatar: owner.avatar || null,
                trustScore: owner.trustScore,
              }
            : null,
        };
      }),
      total,
      hasMore: offset + limit < total,
    };
  }

  async getSessions(
    user: UserDocument,
    type: string,
    role: string,
    limit: number,
    offset: number,
    status?: string,
  ) {
    const userId = user._id as Types.ObjectId;
    const conditions: any[] = [];

    // Role filter
    if (role === "owner") {
      conditions.push({ goalOwnerId: userId });
    } else if (role === "partner") {
      conditions.push({
        $or: [{ approvedHelperId: userId }, { partnerId: userId }],
      });
    } else {
      conditions.push({
        $or: [
          { goalOwnerId: userId },
          { approvedHelperId: userId },
          { partnerId: userId },
        ],
      });
    }

    // Status / type filter
    if (status) {
      conditions.push({ status });
    } else if (type === "upcoming") {
      const now = new Date();
      conditions.push({
        $or: [
          // Future approved sessions: not started yet
          {
            status: { $in: ["approved"] },
            scheduledAt: { $gt: now },
          },
          // Live approved sessions: started but not yet ended (scheduledAt <= now < endsAt)
          {
            status: { $in: ["approved"] },
            scheduledAt: { $lte: now },
            endsAt: { $gte: now },
          },
          // Explicitly in-progress sessions
          { status: SessionStatus.IN_PROGRESS },
        ],
      });
    } else if (type === "past") {
      const now = new Date();
      conditions.push({
        $or: [
          { status: { $in: ["completed", "no-show", "cancelled", "rejected"] } },
          // Approved/scheduled sessions whose end time has already passed
          {
            status: { $in: ["approved", "scheduled"] },
            endsAt: { $lt: now },
          },
        ],
      });
    }

    const filter = conditions.length > 1 ? { $and: conditions } : conditions[0];

    const [sessions, total] = await Promise.all([
      this.sessionModel
        .find(filter)
        .sort({ scheduledAt: -1 })
        .skip(offset)
        .limit(limit)
        .populate("goalId", "title category difficulty topic pledgedPoints")
        .exec(),
      this.sessionModel.countDocuments(filter),
    ]);

    // Collect all helper IDs (approvedHelperId or legacy partnerId)
    const helperIds = sessions.map((s) => this.getHelperId(s)).filter(Boolean);
    const ownerIds = sessions.map((s) => s.goalOwnerId);
    const allUserIds = [
      ...new Set([...helperIds, ...ownerIds].map((id) => id.toString())),
    ].map((id) => new Types.ObjectId(id));
    const usersArr = await this.userModel
      .find({ _id: { $in: allUserIds } })
      .select("name avatar trustScore")
      .exec();
    const userMap = usersArr.reduce(
      (acc, u) => {
        acc[u._id.toString()] = u;
        return acc;
      },
      {} as Record<string, any>,
    );

    return {
      sessions: sessions.map((s) => {
        const isOwner = s.goalOwnerId.toString() === userId.toString();
        const helperId = this.getHelperId(s);
        const otherPersonId = isOwner
          ? helperId?.toString()
          : s.goalOwnerId.toString();
        const otherPerson = otherPersonId ? userMap[otherPersonId] : null;
        const helperPerson = helperId ? userMap[helperId.toString()] : null;
        const goal = s.goalId as any;
        const endsAt = new Date(
          s.scheduledAt.getTime() + (s.duration || 45) * 60 * 1000,
        );
        return {
          id: s._id,
          topic: s.topic,
          category: s.sessionCategory,
          scheduledAt: s.scheduledAt,
          endsAt,
          duration: s.duration,
          status: s.status,
          meetingLink: s.meetingLink || null,
          role: isOwner ? "owner" : "helper",
          goal: goal
            ? {
                id: goal._id,
                title: goal.title,
                category: goal.category,
                difficulty: goal.difficulty,
                pledgedPoints: goal.pledgedPoints,
              }
            : null,
          partner: otherPerson
            ? {
                id: otherPerson._id,
                name: otherPerson.name,
                avatar: otherPerson.avatar || null,
                trustScore: otherPerson.trustScore,
              }
            : null,
          approvedHelper: helperPerson
            ? {
                id: helperPerson._id,
                name: helperPerson.name,
                avatar: helperPerson.avatar || null,
                trustScore: helperPerson.trustScore,
              }
            : null,
          isOwner,
        };
      }),
      total,
    };
  }

  async getSession(user: UserDocument, sessionId: string) {
    const userId = user._id as Types.ObjectId;
    const session = await this.sessionModel
      .findById(sessionId)
      .populate(
        "goalId",
        "title description category difficulty topic pledgedPoints",
      )
      .exec();
    if (!session) throw new NotFoundException("Session not found");

    const helperId = this.getHelperId(session);
    const isOwner = session.goalOwnerId.toString() === userId.toString();
    const isHelper = helperId?.toString() === userId.toString();
    // Also allow pending applicants to view (open/pending_approval sessions are semi-public)
    if (!isOwner && !isHelper) throw new ForbiddenException("Not your session");

    const [goalOwner, helper] = await Promise.all([
      this.userModel
        .findById(session.goalOwnerId)
        .select("name avatar trustScore"),
      helperId
        ? this.userModel.findById(helperId).select("name avatar trustScore")
        : null,
    ]);

    const goal = session.goalId as any;
    const endsAt = new Date(
      session.scheduledAt.getTime() + (session.duration || 45) * 60 * 1000,
    );
    return {
      session: {
        id: session._id,
        topic: session.topic,
        category: session.sessionCategory,
        scheduledAt: session.scheduledAt,
        endsAt,
        duration: session.duration,
        status: session.status,
        meetingLink: session.meetingLink || null,
        notes: session.notes || null,
        approvalDeadline: session.approvalDeadline || null,
        goal: goal
          ? {
              id: goal._id,
              title: goal.title,
              description: goal.description,
              category: goal.category,
              difficulty: goal.difficulty,
              pledgedPoints: goal.pledgedPoints,
            }
          : null,
        goalOwner: goalOwner
          ? {
              id: goalOwner._id,
              name: goalOwner.name,
              avatar: goalOwner.avatar || null,
              trustScore: goalOwner.trustScore,
            }
          : null,
        approvedHelper: helper
          ? {
              id: helper._id,
              name: helper.name,
              avatar: helper.avatar || null,
              trustScore: helper.trustScore,
            }
          : null,
        isOwner,
      },
    };
  }

  async getSessionLiveStatus(sessionId: string) {
    const session = await this.sessionModel
      .findById(sessionId)
      .populate('goalId', 'title description category difficulty topic pledgedPoints')
      .exec();
    if (!session) throw new NotFoundException('Session not found');

    const now = new Date();
    const endsAt = session.endsAt
      ? new Date(session.endsAt)
      : new Date(session.scheduledAt.getTime() + (session.duration || 45) * 60 * 1000);

    const isLive =
      session.status === SessionStatus.IN_PROGRESS ||
      ((session.status === SessionStatus.APPROVED ||
        (session.status as string) === 'scheduled') &&
        session.scheduledAt <= now &&
        endsAt >= now);

    const [goalOwner, helper] = await Promise.all([
      this.userModel.findById(session.goalOwnerId).select('name avatar trustScore'),
      this.getHelperId(session)
        ? this.userModel.findById(this.getHelperId(session)).select('name avatar trustScore')
        : null,
    ]);

    const goal = session.goalId as any;
    return {
      isLive,
      session: {
        id: session._id,
        topic: session.topic,
        category: session.sessionCategory,
        scheduledAt: session.scheduledAt,
        endsAt,
        duration: session.duration,
        status: session.status,
        meetingLink: isLive ? (session.meetingLink || null) : null,
        goal: goal
          ? {
              id: goal._id,
              title: goal.title,
              description: goal.description,
              category: goal.category,
              difficulty: goal.difficulty,
              pledgedPoints: goal.pledgedPoints,
            }
          : null,
        goalOwner: goalOwner
          ? {
              id: goalOwner._id,
              name: goalOwner.name,
              avatar: goalOwner.avatar || null,
              trustScore: goalOwner.trustScore,
            }
          : null,
        approvedHelper: helper
          ? {
              id: helper._id,
              name: helper.name,
              avatar: helper.avatar || null,
              trustScore: helper.trustScore,
            }
          : null,
      },
    };
  }

  async updateSession(
    user: UserDocument,
    sessionId: string,
    dto: UpdateSessionDto,
  ) {
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw new NotFoundException("Session not found");
    const helperId = this.getHelperId(session);
    const isOwner = session.goalOwnerId.toString() === user._id.toString();
    const isHelper = helperId?.toString() === user._id.toString();
    if (!isOwner && !isHelper) throw new ForbiddenException("Not your session");

    const updated = await this.sessionModel
      .findByIdAndUpdate(sessionId, { $set: dto }, { new: true })
      .exec();
    return { session: updated };
  }

  async startSession(user: UserDocument, sessionId: string) {
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw new NotFoundException("Session not found");
    const helperId = this.getHelperId(session);
    const isOwner = session.goalOwnerId.toString() === user._id.toString();
    const isHelper = helperId?.toString() === user._id.toString();
    if (!isOwner && !isHelper) throw new ForbiddenException("Not your session");
    if (
      session.status !== SessionStatus.APPROVED &&
      session.status !== SessionStatus.SCHEDULED
    ) {
      throw new BadRequestException(
        "Session must be in approved/scheduled state to start",
      );
    }

    const updated = await this.sessionModel
      .findByIdAndUpdate(
        sessionId,
        { $set: { status: SessionStatus.IN_PROGRESS } },
        { new: true },
      )
      .exec();
    return { session: { id: updated._id, status: updated.status } };
  }

  async completeSession(
    user: UserDocument,
    sessionId: string,
    dto: CompleteSessionDto,
  ) {
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw new NotFoundException("Session not found");

    const helperId = this.getHelperId(session);
    const isOwner = session.goalOwnerId.toString() === user._id.toString();
    const isHelper = helperId?.toString() === user._id.toString();
    if (!isOwner && !isHelper) throw new ForbiddenException("Not your session");

    const completableStatuses = [
      SessionStatus.APPROVED,
      SessionStatus.SCHEDULED,
      SessionStatus.IN_PROGRESS,
    ];
    if (!completableStatuses.includes(session.status as SessionStatus)) {
      throw new BadRequestException(
        "Session cannot be completed in its current state",
      );
    }

    const goal = await this.goalModel.findById(session.goalId);

    const updateFields: any = {
      status: SessionStatus.COMPLETED,
      completedAt: new Date(),
    };

    if (isOwner) {
      updateFields.goalOwnerRating = dto.rating;
      updateFields.goalOwnerFeedback = dto.feedback || null;
      updateFields.goalOwnerShowedUp = true;
      updateFields.partnerShowedUp = dto.partnerShowedUp;
    } else {
      updateFields.partnerRating = dto.rating;
      updateFields.partnerFeedback = dto.feedback || null;
      updateFields.partnerShowedUp = true;
      updateFields.goalOwnerShowedUp = dto.partnerShowedUp;
    }

    const updatedSession = await this.sessionModel
      .findByIdAndUpdate(sessionId, { $set: updateFields }, { new: true })
      .exec();

    let pointsEarned = 0;
    const userId = user._id as Types.ObjectId;

    if (dto.partnerShowedUp) {
      pointsEarned = 10 + Math.round((dto.rating - 1) * 3.75);
      await this.userModel.findByIdAndUpdate(userId, {
        $inc: { totalPoints: pointsEarned, sessionsCompleted: 1 },
      });
      await this.trustLogModel.create({
        userId,
        action: TrustScoreAction.SESSION_COMPLETED,
        pointsChange: pointsEarned,
        description: "Session completed with good attendance",
        sessionId: session._id,
      });

      if (isOwner && goal) {
        // Transfer pledgedPoints to the helper; do NOT mark goal as completed
        await this.userModel.findByIdAndUpdate(helperId, {
          $inc: { totalPoints: goal.pledgedPoints, goalsHelped: 1 },
        });
      }
    } else {
      const app = await this.applicationModel.findOne({
        sessionId: session._id,
        status: "approved",
      });
      const stakedPoints = app ? app.stakedPoints : 0;
      await this.userModel.findByIdAndUpdate(userId, {
        $inc: {
          totalPoints: isOwner ? (goal ? goal.pledgedPoints : 0) : stakedPoints,
        },
      });
      const noShowUserId = isOwner ? helperId : session.goalOwnerId;
      await this.trustLogModel.create({
        userId: noShowUserId,
        action: TrustScoreAction.NO_SHOW,
        pointsChange: -stakedPoints,
        description: "Partner did not show up for the session",
        sessionId: session._id,
      });
    }

    return {
      session: {
        id: updatedSession._id,
        status: updatedSession.status,
        completedAt: updatedSession.completedAt,
      },
      pointsEarned,
    };
  }

  async cancelSession(
    user: UserDocument,
    sessionId: string,
    dto: CancelSessionDto,
  ) {
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw new NotFoundException("Session not found");

    const helperId = this.getHelperId(session);
    const isOwner = session.goalOwnerId.toString() === user._id.toString();
    const isHelper = helperId?.toString() === user._id.toString();
    if (!isOwner && !isHelper) throw new ForbiddenException("Not your session");

    if (
      session.status === SessionStatus.COMPLETED ||
      session.status === SessionStatus.CANCELLED
    ) {
      throw new BadRequestException("Session is already finished");
    }

    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const isLateCancellation = session.scheduledAt <= twoHoursFromNow;
    let pointsLost = 0;

    if (isLateCancellation) {
      pointsLost = 15;
      await this.userModel.findByIdAndUpdate(user._id, {
        $inc: { totalPoints: -pointsLost },
      });
      await this.trustLogModel.create({
        userId: user._id,
        action: TrustScoreAction.LATE_CANCEL,
        pointsChange: -pointsLost,
        description: "Late cancellation (< 2h before session)",
        sessionId: session._id,
      });
      // Late cancel permanently cancels the slot
      const updated = await this.sessionModel
        .findByIdAndUpdate(
          sessionId,
          { $set: { status: SessionStatus.CANCELLED } },
          { new: true },
        )
        .exec();
      return {
        session: { id: updated._id, status: updated.status },
        pointsLost,
      };
    } else {
      // Early cancel — refund helper's staked points and reset slot to open
      if (helperId) {
        const app = await this.applicationModel.findOne({
          sessionId: session._id,
          status: "approved",
        });
        if (app) {
          await this.userModel.findByIdAndUpdate(helperId, {
            $inc: { totalPoints: app.stakedPoints },
          });
          await this.applicationModel.findByIdAndUpdate(app._id, {
            $set: { status: "rejected" },
          });
        }
      }
      // Reset slot to open so a new helper can apply
      const updated = await this.sessionModel
        .findByIdAndUpdate(
          sessionId,
          {
            $set: {
              status: SessionStatus.OPEN,
              approvedHelperId: null,
              approvedAt: null,
            },
          },
          { new: true },
        )
        .exec();
      return {
        session: { id: updated._id, status: updated.status },
        pointsLost: 0,
      };
    }
  }
}
