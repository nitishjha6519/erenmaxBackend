import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { User, UserDocument } from "../users/schemas/user.schema";
import {
  Application,
  ApplicationDocument,
} from "../applications/schemas/application.schema";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Application.name)
    private applicationModel: Model<ApplicationDocument>,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.userModel.findOne({ email: dto.email });
    if (existing) {
      throw new ConflictException("Email already exists");
    }
    const hashed = await bcrypt.hash(dto.password, 10);
    let user: UserDocument;
    try {
      user = await this.userModel.create({
        name: dto.name,
        email: dto.email,
        password: hashed,
        trustScore: 50,
        totalPoints: 500,
        showRate: 100,
        sessionsCompleted: 0,
        goalsPosted: 0,
        goalsHelped: 0,
        streak: 0,
        badges: [],
      });
    } catch (err) {
      if (err.code === 11000)
        throw new ConflictException("Email already registered");
      throw err;
    }

    const token = this.signToken(user);
    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        trustScore: user.trustScore,
        totalPoints: user.totalPoints,
        createdAt: user.createdAt,
      },
      token,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userModel
      .findOne({ email: dto.email })
      .select("+password");
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const token = this.signToken(user);
    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || null,
        trustScore: user.trustScore,
        totalPoints: user.totalPoints,
        showRate: user.showRate,
      },
      token,
    };
  }

  async getMe(user: UserDocument) {
    const stakedResult = await this.applicationModel.aggregate([
      { $match: { applicantId: user._id, status: "pending" } },
      { $group: { _id: null, total: { $sum: "$stakedPoints" } } },
    ]);
    const stakedPoints = stakedResult.length > 0 ? stakedResult[0].total : 0;
    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || null,
        bio: user.bio || null,
        trustScore: user.trustScore,
        totalPoints: user.totalPoints,
        stakedPoints,
        showRate: user.showRate,
        sessionsCompleted: user.sessionsCompleted,
        goalsPosted: user.goalsPosted,
        goalsHelped: user.goalsHelped,
        streak: user.streak,
        badges: user.badges,
      },
    };
  }

  private signToken(user: UserDocument): string {
    return this.jwtService.sign({
      userId: user._id,
      email: user.email,
    });
  }
}
