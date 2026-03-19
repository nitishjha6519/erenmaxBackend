import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Session, SessionDocument } from "../sessions/schemas/session.schema";
import { User, UserDocument } from "../users/schemas/user.schema";

@Injectable()
export class PartnersService {
  constructor(
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async getPartners(user: UserDocument, limit: number, offset: number) {
    const userId = user._id as Types.ObjectId;

    const sessions = await this.sessionModel
      .find({
        $or: [
          { goalOwnerId: userId },
          { approvedHelperId: userId },
          { partnerId: userId },
        ],
        status: "completed",
      })
      .sort({ completedAt: -1 })
      .exec();

    const partnerMap: Record<
      string,
      { sessions: number; lastSessionAt: Date; ratings: number[] }
    > = {};

    for (const s of sessions) {
      const isOwner = s.goalOwnerId.toString() === userId.toString();
      const helperId = (s.approvedHelperId || s.partnerId)?.toString();
      if (!helperId && isOwner) continue; // no partner on this session yet
      const partnerId = isOwner ? helperId : s.goalOwnerId.toString();

      if (!partnerMap[partnerId]) {
        partnerMap[partnerId] = {
          sessions: 0,
          lastSessionAt: null,
          ratings: [],
        };
      }
      partnerMap[partnerId].sessions++;
      if (
        !partnerMap[partnerId].lastSessionAt ||
        s.completedAt > partnerMap[partnerId].lastSessionAt
      ) {
        partnerMap[partnerId].lastSessionAt = s.completedAt;
      }
      const rating = isOwner ? s.goalOwnerRating : s.partnerRating;
      if (rating != null) partnerMap[partnerId].ratings.push(rating);
    }

    const partnerIds = Object.keys(partnerMap)
      .sort((a, b) =>
        partnerMap[b].lastSessionAt > partnerMap[a].lastSessionAt ? 1 : -1,
      )
      .slice(offset, offset + limit);

    const users = await this.userModel
      .find({ _id: { $in: partnerIds.map((id) => new Types.ObjectId(id)) } })
      .select("name avatar trustScore")
      .exec();

    const userMap = users.reduce(
      (acc, u) => {
        acc[u._id.toString()] = u;
        return acc;
      },
      {} as Record<string, any>,
    );

    const partners = partnerIds.map((id) => {
      const u = userMap[id];
      const data = partnerMap[id];
      const avgRating =
        data.ratings.length > 0
          ? Math.round(
              (data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length) *
                10,
            ) / 10
          : 0;
      return {
        user: u
          ? {
              id: u._id,
              name: u.name,
              avatar: u.avatar || null,
              trustScore: u.trustScore,
            }
          : { id, name: "Unknown", avatar: null, trustScore: 0 },
        sessionsCount: data.sessions,
        lastSessionAt: data.lastSessionAt,
        averageRating: avgRating,
      };
    });

    return {
      partners,
      total: Object.keys(partnerMap).length,
    };
  }
}
