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
  Application,
  ApplicationDocument,
  ApplicationStatus,
} from "./schemas/application.schema";
import { Goal, GoalDocument } from "../goals/schemas/goal.schema";
import { User, UserDocument } from "../users/schemas/user.schema";
import {
  Session,
  SessionDocument,
  SessionStatus,
} from "../sessions/schemas/session.schema";
import { CreateApplicationDto } from "./dto/create-application.dto";

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectModel(Application.name)
    private applicationModel: Model<ApplicationDocument>,
    @InjectModel(Goal.name) private goalModel: Model<GoalDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
  ) {}

  async applyToSession(
    user: UserDocument,
    sessionId: string,
    dto: CreateApplicationDto,
  ) {
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw new NotFoundException("Session not found");

    // Enforce 10-minute application window only for sessions not yet approved
    const notYetApproved =
      session.status === SessionStatus.OPEN ||
      session.status === SessionStatus.PENDING_APPROVAL;
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
    if (notYetApproved && session.scheduledAt < tenMinsAgo) {
      // Lazily close if still marked open
      if ((session as any).applicationOpen !== false) {
        await this.sessionModel.findByIdAndUpdate(sessionId, {
          $set: { applicationOpen: false },
        });
      }
      throw new BadRequestException(
        "Application window has closed — session scheduled time has elapsed by more than 10 minutes",
      );
    }
    if (notYetApproved && (session as any).applicationOpen === false) {
      throw new BadRequestException("Applications are closed for this session");
    }

    if (
      session.status !== SessionStatus.OPEN &&
      session.status !== SessionStatus.PENDING_APPROVAL
    ) {
      throw new BadRequestException(
        "This session slot is not accepting applications",
      );
    }

    if (session.goalOwnerId.toString() === user._id.toString()) {
      throw new BadRequestException("Cannot apply to your own session");
    }

    const existing = await this.applicationModel.findOne({
      sessionId: new Types.ObjectId(sessionId),
      applicantId: user._id,
      status: { $in: ["pending", "approved"] },
    });
    if (existing)
      throw new ConflictException("You have already applied to this slot");

    if (user.totalPoints < dto.stakedPoints) {
      throw new BadRequestException("Insufficient points to stake");
    }

    // Helper time-conflict check: applicant must not already have an approved/pending
    // session that overlaps [session.scheduledAt, session.endsAt]
    const sessionEndsAt = session.endsAt
      ? new Date(session.endsAt)
      : new Date(session.scheduledAt.getTime() + (session.duration || 45) * 60 * 1000);

    const conflictingAsHelper = await this.sessionModel.findOne({
      $or: [
        { approvedHelperId: user._id },
        { partnerId: user._id },
      ],
      status: { $nin: [SessionStatus.CANCELLED, SessionStatus.DESERTED] },
      scheduledAt: { $lt: sessionEndsAt },
      endsAt: { $gt: session.scheduledAt },
    });
    if (conflictingAsHelper) {
      throw new BadRequestException(
        `You already have a session as helper that conflicts with this time slot (${conflictingAsHelper.topic} at ${conflictingAsHelper.scheduledAt.toISOString()})`,
      );
    }

    const conflictingAsOwner = await this.sessionModel.findOne({
      goalOwnerId: user._id,
      status: { $nin: [SessionStatus.CANCELLED, SessionStatus.DESERTED] },
      scheduledAt: { $lt: sessionEndsAt },
      endsAt: { $gt: session.scheduledAt },
    });
    if (conflictingAsOwner) {
      throw new BadRequestException(
        `You already have a session as owner that conflicts with this time slot (${conflictingAsOwner.topic} at ${conflictingAsOwner.scheduledAt.toISOString()})`,
      );
    }

    let application: ApplicationDocument;
    try {
      application = await this.applicationModel.create({
        sessionId: new Types.ObjectId(sessionId),
        goalId: session.goalId,
        applicantId: user._id,
        message: dto.message || null,
        stakedPoints: dto.stakedPoints,
        status: ApplicationStatus.PENDING,
      });
    } catch (err) {
      if (err.code === 11000)
        throw new ConflictException("You have already applied to this slot");
      throw err;
    }

    await this.userModel.findByIdAndUpdate(user._id, {
      $inc: { totalPoints: -dto.stakedPoints },
    });

    return { application };
  }

  async getGoalApplications(user: UserDocument, goalId: string) {
    const goal = await this.goalModel.findById(goalId);
    if (!goal) throw new NotFoundException("Goal not found");
    if (goal.userId.toString() !== user._id.toString()) {
      throw new ForbiddenException("Not the owner of this goal");
    }

    const applications = await this.applicationModel
      .find({ goalId: new Types.ObjectId(goalId) })
      .populate(
        "applicantId",
        "name avatar trustScore showRate sessionsCompleted",
      )
      .populate(
        "sessionId",
        "topic sessionCategory scheduledAt status approvalDeadline",
      )
      .sort({ createdAt: -1 })
      .exec();

    return {
      applications: applications.map((a) => {
        const applicant = a.applicantId as any;
        const session = a.sessionId as any;
        return {
          id: a._id,
          sessionId: a.sessionId,
          sessionTopic: session?.topic || null,
          sessionCategory: session?.sessionCategory || null,
          sessionScheduledAt: session?.scheduledAt || null,
          sessionStatus: session?.status || null,
          message: a.message || null,
          stakedPoints: a.stakedPoints,
          status: a.status,
          createdAt: a.createdAt,
          applicant: {
            id: applicant._id,
            name: applicant.name,
            avatar: applicant.avatar || null,
            trustScore: applicant.trustScore,
            showRate: applicant.showRate,
            showUpRate: Math.round((applicant.showRate / 100) * 100) / 100,
            sessionsCompleted: applicant.sessionsCompleted,
            sessionsCount: applicant.sessionsCompleted,
          },
        };
      }),
    };
  }

  async approve(user: UserDocument, applicationId: string) {
    const application = await this.applicationModel
      .findById(applicationId)
      .populate("goalId")
      .exec();
    if (!application) throw new NotFoundException("Application not found");

    const goal = application.goalId as unknown as GoalDocument;
    if (goal.userId.toString() !== user._id.toString()) {
      throw new ForbiddenException("Not the owner of this goal");
    }
    if (application.status !== ApplicationStatus.PENDING) {
      throw new BadRequestException("Application is no longer pending");
    }

    const sessionId = (application as any).sessionId;
    if (!sessionId)
      throw new BadRequestException("Application has no associated session");

    await this.applicationModel.findByIdAndUpdate(applicationId, {
      $set: { status: ApplicationStatus.APPROVED },
    });

    // Update the existing session slot — set approvedHelperId and advance status
    const updatedSession = await this.sessionModel.findByIdAndUpdate(
      sessionId,
      {
        $set: {
          approvedHelperId: application.applicantId,
          status: SessionStatus.APPROVED,
          approvedAt: new Date(),
        },
      },
      { new: true },
    );

    // Reject + refund other pending applicants for THIS session only
    const otherPending = await this.applicationModel.find({
      sessionId,
      status: ApplicationStatus.PENDING,
      _id: { $ne: new Types.ObjectId(applicationId) },
    });
    for (const app of otherPending) {
      await this.applicationModel.findByIdAndUpdate(app._id, {
        $set: { status: ApplicationStatus.REJECTED },
      });
      await this.userModel.findByIdAndUpdate(app.applicantId, {
        $inc: { totalPoints: app.stakedPoints },
      });
    }

    return {
      application: { id: application._id, status: "approved" },
      session: {
        id: updatedSession._id,
        status: updatedSession.status,
        approvedHelperId: updatedSession.approvedHelperId,
      },
    };
  }

  async reject(user: UserDocument, applicationId: string) {
    const application = await this.applicationModel
      .findById(applicationId)
      .populate("goalId")
      .exec();
    if (!application) throw new NotFoundException("Application not found");

    const goal = application.goalId as unknown as GoalDocument;
    if (goal.userId.toString() !== user._id.toString()) {
      throw new ForbiddenException("Not the owner of this goal");
    }
    if (application.status !== ApplicationStatus.PENDING) {
      throw new BadRequestException("Application is no longer pending");
    }

    await this.applicationModel.findByIdAndUpdate(applicationId, {
      $set: { status: ApplicationStatus.REJECTED },
    });

    await this.userModel.findByIdAndUpdate(application.applicantId, {
      $inc: { totalPoints: application.stakedPoints },
    });

    return { application: { id: application._id, status: "rejected" } };
  }

  async withdraw(user: UserDocument, applicationId: string) {
    const application = await this.applicationModel.findById(applicationId);
    if (!application) throw new NotFoundException("Application not found");
    if (application.applicantId.toString() !== user._id.toString()) {
      throw new ForbiddenException("Not your application");
    }
    if (application.status !== ApplicationStatus.PENDING) {
      throw new BadRequestException(
        "Only pending applications can be withdrawn",
      );
    }

    await this.applicationModel.findByIdAndUpdate(applicationId, {
      $set: { status: ApplicationStatus.WITHDRAWN },
    });

    await this.userModel.findByIdAndUpdate(user._id, {
      $inc: { totalPoints: application.stakedPoints },
    });

    return { message: "Application withdrawn" };
  }

  async getMyApplications(userId: string, type: string, status: string) {
    const filter: any = { applicantId: new Types.ObjectId(userId) };
    if (status && status !== "all") filter.status = status;

    const applications = await this.applicationModel
      .find(filter)
      .populate({
        path: "goalId",
        populate: { path: "userId", select: "name avatar" },
      })
      .populate(
        "sessionId",
        "topic sessionCategory scheduledAt status endsAt duration",
      )
      .sort({ createdAt: -1 })
      .exec();

    const now = new Date();

    const mapApp = (a: ApplicationDocument) => {
      const goal = a.goalId as any;
      const session = (a as any).sessionId as any;
      const endsAt = session?.endsAt
        ? new Date(session.endsAt)
        : session?.scheduledAt
          ? new Date(
              new Date(session.scheduledAt).getTime() +
                (session.duration || 45) * 60 * 1000,
            )
          : null;

      let appType: string;
      if (
        a.status === "pending" &&
        session?.scheduledAt &&
        new Date(session.scheduledAt) > now
      ) {
        appType = "pending";
      } else if (a.status === "approved" && endsAt && endsAt >= now) {
        appType = "upcoming";
      } else {
        appType = "past";
      }

      return {
        id: a._id,
        type: appType,
        status: a.status,
        stakedPoints: a.stakedPoints,
        createdAt: a.createdAt,
        sessionId: a.sessionId,
        session: session
          ? {
              id: session._id,
              topic: session.topic,
              category: session.sessionCategory,
              scheduledAt: session.scheduledAt,
              endsAt,
              status: session.status,
            }
          : null,
        goal: goal
          ? {
              id: goal._id,
              title: goal.title,
              category: goal.category,
              status: goal.status,
              user: {
                id: goal.userId._id,
                name: goal.userId.name,
                avatar: goal.userId.avatar || null,
              },
            }
          : null,
      };
    };

    const mapped = applications.map(mapApp);

    if (type && type !== "all") {
      const filtered = mapped.filter((a) => a.type === type);
      return { applications: filtered, total: filtered.length };
    }

    return {
      applications: mapped,
      pending: mapped.filter((a) => a.type === "pending"),
      upcoming: mapped.filter((a) => a.type === "upcoming"),
      past: mapped.filter((a) => a.type === "past"),
      total: mapped.length,
    };
  }
}
