import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../../modules/users/schemas/user.schema';

/**
 * KycVerifiedGuard — Chặn người dùng chưa được duyệt hồ sơ KYC (status !== 'VERIFIED').
 * Đảm bảo an toàn cho các giao dịch tài chính (Đầu tư, Vay, Ví).
 */
@Injectable()
export class KycVerifiedGuard implements CanActivate {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || (!user._id && !user.id)) {
      throw new ForbiddenException('Bạn cần đăng nhập để thực hiện chức năng này.');
    }

    const userId = user._id || user.id;

    // Fetch the latest KYC status from MongoDB (Live check)
    // Avoid using stale status from JWT token for security reasons.
    const foundUser = await this.userModel.findById(userId).select('kycStatus').lean();

    if (!foundUser) {
      throw new ForbiddenException('Không tìm thấy thông tin người dùng.');
    }

    if (foundUser.kycStatus !== 'VERIFIED') {
      throw new ForbiddenException(
        'Tài khoản của bạn chưa được duyệt định danh (eKYC). Vui lòng hoàn tất và chờ phê duyệt để mở khóa chức năng này.',
      );
    }

    return true;
  }
}
