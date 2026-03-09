import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from './schemas/user.schema';

@Injectable()
export class UsersService {
    constructor(
        @InjectModel(User.name) private readonly userModel: Model<User>,
    ) { }

    async updatePushToken(userId: string, pushToken: string): Promise<void> {
        const result = await this.userModel.updateOne(
            { _id: new Types.ObjectId(userId) },
            { $set: { pushToken } },
        );

        if (result.matchedCount === 0) {
            throw new NotFoundException('User not found');
        }
    }

    async findPushTokenByUserId(userId: string): Promise<string | null> {
        const user = await this.userModel.findById(userId).select('pushToken').lean();
        return user?.pushToken || null;
    }
}
