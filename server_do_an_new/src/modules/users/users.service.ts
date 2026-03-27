import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from './schemas/user.schema';

/**
 * Service quản lý thông tin tổng quan của User (đứng độc lập với Auth).
 * Cung cấp các hàm liên quan đến Push notification token và dữ liệu user cơ bản.
 */
@Injectable()
export class UsersService {
    constructor(
        @InjectModel(User.name) private readonly userModel: Model<User>,
    ) { }

    /**
     * Cập nhật Push Token (FCM Token) của người dùng thiết bị mobile để nhận thông báo.
     * 
     * @param userId - ID người dùng trên hệ thống (MongoDB ObjectId)
     * @param pushToken - Chuỗi Token được sinh từ Firebase/Expo của thiết bị 
     * @throws {NotFoundException} Nếu không tìm thấy user ID tương ứng trong CSDL
     */
    async updatePushToken(userId: string, pushToken: string): Promise<void> {
        const result = await this.userModel.updateOne(
            { _id: new Types.ObjectId(userId) },
            { $set: { pushToken } },
        );

        if (result.matchedCount === 0) {
            throw new NotFoundException('User not found');
        }
    }

    /**
     * Lấy Push Token hiện tại của tài khoản để tiến hành gửi Push Notification.
     * 
     * @param userId - ID người dùng
     * @returns {Promise<string | null>} Push token của người dùng hoặc null nếu chưa có
     */
    async findPushTokenByUserId(userId: string): Promise<string | null> {
        const user = await this.userModel.findById(userId).select('pushToken').lean();
        return user?.pushToken || null;
    }
}
