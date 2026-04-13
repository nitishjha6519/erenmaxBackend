import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
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

  /** Lazily marks a session as deserted when the time window has passed with no owner feedback */
  private async markDeseratedIfExpired(
    session: SessionDocument,
  ): Promise<SessionDocument> {
    const activeStatuses = [
      SessionStatus.APPROVED,
      SessionStatus.SCHEDULED,
      SessionStatus.IN_PROGRESS,
    ];
    if (!activeStatuses.includes(session.status as SessionStatus)) {
      return session;
    }
    const now = new Date();
    const endsAt = session.endsAt
      ? new Date(session.endsAt)
      : new Date(
          session.scheduledAt.getTime() + (session.duration || 30) * 60 * 1000,
        );
    if (endsAt >= now) return session; // still within window
    if (session.goalOwnerRating != null) return session; // owner already submitted

    // Owner forfeits their staked points — no refund when session goes deserted

    return this.sessionModel
      .findByIdAndUpdate(
        session._id,
        { $set: { status: SessionStatus.DESERTED } },
        { new: true },
      )
      .populate(
        "goalId",
        "title description category difficulty topic pledgedPoints",
      )
      .exec();
  }

  async getOpenSlots(category?: string, limit = 20, offset = 0) {
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);

    // Lazily close applicationOpen on sessions past the 10-min window that are not yet approved
    await this.sessionModel.updateMany(
      {
        status: { $in: [SessionStatus.OPEN, SessionStatus.PENDING_APPROVAL] },
        applicationOpen: true,
        scheduledAt: { $lt: tenMinsAgo },
      },
      { $set: { applicationOpen: false } },
    );

    const openGoalIds = await this.goalModel
      .find({ status: GoalStatus.OPEN })
      .distinct("_id");

    const filter: any = {
      status: SessionStatus.OPEN,
      applicationOpen: true,
      scheduledAt: { $gte: tenMinsAgo },
      goalId: { $in: openGoalIds },
    };
    if (category) filter.sessionCategory = category;

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
          endsAt: s.endsAt,
          duration: s.duration,
          applicationOpen: (s as any).applicationOpen ?? true,
          applicationCount: appCountMap[s._id.toString()] || 0,
          ownerStakedPoints: (s as any).ownerStakedPoints || 0,
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

  async getOpenSessions(
    category?: string,
    from?: string,
    limit = 20,
    offset = 0,
  ) {
    // Only surface sessions whose parent goal is still open
    const openGoalIds = await this.goalModel
      .find({ status: GoalStatus.OPEN })
      .distinct("_id");

    const filter: any = {
      status: SessionStatus.OPEN,
      goalId: { $in: openGoalIds },
    };
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
            //status: { $in: ["approved"] },
            scheduledAt: { $gt: now },
          },
          // Live approved sessions: started but not yet ended (scheduledAt <= now < endsAt)
          {
            // status: { $in: ["approved"] },
            scheduledAt: { $lte: now },
            endsAt: { $gte: now },
          },
          // Explicitly in-progress sessions
          //{ status: SessionStatus.IN_PROGRESS },
        ],
      });
    } else if (type === "past") {
      const now = new Date();
      conditions.push({
        $or: [
          {
            status: {
              $in: [
                "completed",
                "no-show",
                "cancelled",
                "rejected",
                "deserted",
              ],
            },
          },
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
    let session = await this.sessionModel
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

    // Lazily mark deserted if time window expired without owner feedback
    session = (await this.markDeseratedIfExpired(session)) as any;

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
        feedbackSubmitted: isOwner
          ? session.goalOwnerRating != null
          : session.partnerRating != null,
        goalOwnerFeedbackSubmitted: session.goalOwnerRating != null,
        partnerFeedbackSubmitted: session.partnerRating != null,
      },
    };
  }

  async getSessionLiveStatus(sessionId: string) {
    const session = await this.sessionModel
      .findById(sessionId)
      .populate(
        "goalId",
        "title description category difficulty topic pledgedPoints",
      )
      .exec();
    if (!session) throw new NotFoundException("Session not found");

    const now = new Date();
    const endsAt = session.endsAt
      ? new Date(session.endsAt)
      : new Date(
          session.scheduledAt.getTime() + (session.duration || 30) * 60 * 1000,
        );

    const bothFeedbackDone =
      session.goalOwnerRating != null && session.partnerRating != null;

    const isLive =
      !bothFeedbackDone &&
      // session.status === SessionStatus.IN_PROGRESS ||
      // session.status === SessionStatus.APPROVED ||
      // (session.status === SessionStatus.COMPLETED
      //     &&
      session.scheduledAt <= now &&
      endsAt >= now;
    console.log(
      isLive,
      "isLive",
      "session.scheduledAt ",
      session.scheduledAt,
      endsAt,
    );
    const [goalOwner, helper] = await Promise.all([
      this.userModel
        .findById(session.goalOwnerId)
        .select("name avatar trustScore"),
      this.getHelperId(session)
        ? this.userModel
            .findById(this.getHelperId(session))
            .select("name avatar trustScore")
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
        meetingLink: isLive ? session.meetingLink || null : null,
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
      SessionStatus.OPEN,
      SessionStatus.APPROVED,
      SessionStatus.IN_PROGRESS,
      SessionStatus.COMPLETED,
    ];
    if (!completableStatuses.includes(session.status as SessionStatus)) {
      throw new BadRequestException(
        "Session cannot be completed in its current state",
      );
    }

    // Enforce time window: feedback only accepted during the session slot
    const now = new Date();
    const endsAt = session.endsAt
      ? new Date(session.endsAt)
      : new Date(
          session.scheduledAt.getTime() + (session.duration || 45) * 60 * 1000,
        );
    if (now < session.scheduledAt) {
      throw new BadRequestException(
        "Session has not started yet — feedback window is not open",
      );
    }
    if (now > endsAt) {
      throw new BadRequestException(
        "Feedback window has closed — the session time slot has ended",
      );
    }

    // Prevent re-submission
    if (isOwner && session.goalOwnerRating != null) {
      throw new ConflictException("You have already submitted your feedback");
    }
    if (isHelper && session.partnerRating != null) {
      throw new ConflictException("You have already submitted your feedback");
    }

    const goal = await this.goalModel.findById(session.goalId);

    // Owner submitting their feedback marks the session as COMPLETED.
    // Helper can submit during the window too, but completion is owner-driven.
    const updateFields: any = {};
    if (isOwner) {
      updateFields.status = SessionStatus.COMPLETED;
      updateFields.completedAt = new Date();
    }

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

    // Auto-complete the goal once 100 sessions for it are completed
    if (isOwner) {
      const completedCount = await this.sessionModel.countDocuments({
        goalId: session.goalId,
        status: SessionStatus.COMPLETED,
      });
      if (completedCount >= 100) {
        await this.goalModel.findByIdAndUpdate(session.goalId, {
          $set: { status: GoalStatus.COMPLETED },
        });
      }
    }

    const userId = user._id as Types.ObjectId;
    const pledged = goal?.pledgedPoints || 0;
    let pointsEarned = 0;

    const app = await this.applicationModel.findOne({
      sessionId: session._id,
      status: "approved",
    });
    const helperStaked = app ? app.stakedPoints : 0;

    if (isOwner) {
      const ownerStaked = (session as any).ownerStakedPoints || 0;

      if (dto.partnerShowedUp) {
        // Owner: staked returned + pledgedPoints bonus
        pointsEarned = ownerStaked + pledged;
        await this.userModel.findByIdAndUpdate(userId, {
          $inc: { totalPoints: pointsEarned, sessionsCompleted: 1 },
        });
        await this.trustLogModel.create({
          userId,
          action: TrustScoreAction.SESSION_COMPLETED,
          pointsChange: pointsEarned,
          description:
            "Session completed — staked points returned + goal bonus",
          sessionId: session._id,
        });

        // Helper: only pay if they haven't submitted yet (their submission pays them directly)
        if (helperId && session.partnerRating == null) {
          const helperEarned = helperStaked + pledged;
          await this.userModel.findByIdAndUpdate(helperId, {
            $inc: { totalPoints: helperEarned, goalsHelped: 1 },
          });
          await this.trustLogModel.create({
            userId: helperId,
            action: TrustScoreAction.SESSION_COMPLETED,
            pointsChange: helperEarned,
            description:
              "Session completed — staked points returned + helper bonus",
            sessionId: session._id,
          });
        }
      } else {
        // Helper no-show — owner gets staked back only, helper forfeits staked
        pointsEarned = ownerStaked;
        await this.userModel.findByIdAndUpdate(userId, {
          $inc: { totalPoints: ownerStaked, sessionsCompleted: 1 },
        });
        if (helperId && helperStaked > 0) {
          await this.trustLogModel.create({
            userId: helperId,
            action: TrustScoreAction.NO_SHOW,
            pointsChange: -helperStaked,
            description: "Helper did not show up — staked points forfeited",
            sessionId: session._id,
          });
        }
      }
    } else {
      // Helper submission always pays out immediately — staked returned + pledgedPoints bonus.
      // This covers both the normal case (owner completes later) and the deserted case
      // (owner never submits, so helper gets rewarded for showing up regardless).
      pointsEarned = helperStaked + pledged;
      await this.userModel.findByIdAndUpdate(userId, {
        $inc: {
          totalPoints: pointsEarned,
          goalsHelped: 1,
          sessionsCompleted: 1,
        },
      });
      await this.trustLogModel.create({
        userId,
        action: TrustScoreAction.SESSION_COMPLETED,
        pointsChange: pointsEarned,
        description:
          "Session completed — staked points returned + helper bonus",
        sessionId: session._id,
      });
    }

    return {
      submitted: true,
      session: {
        id: updatedSession._id,
        status: updatedSession.status,
        completedAt: updatedSession.completedAt || null,
        goalOwnerFeedbackSubmitted: updatedSession.goalOwnerRating != null,
        partnerFeedbackSubmitted: updatedSession.partnerRating != null,
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
      // Refund owner's staked points even on late cancel
      const ownerStaked = (session as any).ownerStakedPoints || 0;
      if (ownerStaked > 0) {
        await this.userModel.findByIdAndUpdate(session.goalOwnerId, {
          $inc: { totalPoints: ownerStaked },
        });
      }
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
      // Early cancel — refund helper's staked points and owner's staked points, reset slot to open
      const ownerStaked = (session as any).ownerStakedPoints || 0;
      if (ownerStaked > 0) {
        await this.userModel.findByIdAndUpdate(session.goalOwnerId, {
          $inc: { totalPoints: ownerStaked },
        });
      }
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
