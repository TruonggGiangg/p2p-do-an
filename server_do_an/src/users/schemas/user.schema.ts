import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';

//tao document de mapping den DB mongoDB
export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  // Thông tin đăng nhập hiện có (giữ nguyên)
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  age: number;

  @Prop({ required: true })
  role: string; // ADMIN | LENDER | BORROWER

  @Prop()
  gender: string;

  @Prop()
  address: string;

  @Prop()
  refreshToken: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;

  @Prop()
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Object })
  createdBy?: {
    _id: mongoose.Schema.Types.ObjectId;
    email: string;
  };

  @Prop({ type: Object })
  updatedBy?: {
    _id: mongoose.Schema.Types.ObjectId;
    email: string;
  };

  @Prop({ type: Object })
  deletedBy?: {
    _id: mongoose.Schema.Types.ObjectId;
    email: string;
  };

  // ========== Ánh xạ từ server cũ: Users ==========
  @Prop({ trim: true })
  phone?: string; // unique ở server cũ

  @Prop({ trim: true })
  category?: string; // lender | borrower | admin (server cũ)

  @Prop({ default: false })
  isBusiness?: boolean;

  @Prop({ default: true })
  isActive?: boolean;

  @Prop()
  connectedHL?: string;

  @Prop()
  certificateHL?: string;

  @Prop()
  privateKey?: string;

  @Prop()
  blockchainId?: string;

  // Ví gộp: thay cho usdtWallets/externalWallets/investmentWallet/spendingWallet
  @Prop({ type: [Object], default: [] })
  wallets?: Array<{
    type: 'INVESTMENT' | 'SPENDING' | 'USDT' | 'EXTERNAL';
    network?: 'ethereum' | 'tron';
    address: string;
    privateKey?: string;
    balance?: number;
    currency?: string;
    isActive?: boolean;
    createdAt?: Date;
    lastUpdated?: Date;
  }>;

  @Prop({ type: [mongoose.Schema.Types.Mixed], default: [] })
  loanOptions?: any[]; // giữ nguyên kiểu Mixed từ server cũ

  // ========== Ánh xạ từ server cũ: UserDetails (gộp vào user.profile) ==========
  @Prop({ type: Object, default: { declared: false } })
  profile?: {
    declared: boolean;
    _id?: mongoose.Schema.Types.ObjectId; // id UserDetails cũ (nếu cần tương thích)

    // Các trường chi tiết gộp vào để không cần bảng riêng
    fullName?: string; // Tên đầy đủ
    dateOfBirth?: Date; // Ngày sinh
    birth?: Date; // Tương thích với server cũ
    gender?: string; // male | female | other
    sex?: string; // Tương thích với server cũ
    email?: string; // email cá nhân (khác với login email nếu cần)
    address?: string; // Địa chỉ
    city?: string; // Thành phố
    ssn?: string; // CMND/CCCD (Social Security Number)
    job?: string; // Nghề nghiệp
    income?: number; // Thu nhập hàng tháng
    imageURLs?: string[]; // Hình ảnh xác nhận (nếu cần)
    score?: number; // Điểm tín dụng
    createdAt?: Date; // Khi profile được tạo
  };
}

export const UserSchema = SchemaFactory.createForClass(User);
