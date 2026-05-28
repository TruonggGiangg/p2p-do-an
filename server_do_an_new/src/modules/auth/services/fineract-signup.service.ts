import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserStatus, UserType } from '../../users/schemas/user.schema';
import { Wallet } from '../../wallets/schemas/wallet.schema';
import { Notification } from '../../loan/schemas/notification.schema';
import { KeycloakService } from './keycloak.service';
import { FineractService } from '../../fineract/fineract.service';
import { CreditScoreService } from '../../credit-score/credit-score.service';

export interface SignupData {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email?: string;
  password: string;
  userType?: 'borrower' | 'lender' | 'staff';
}

export interface SignupResult {
  username: string;
  keycloakUserId: string;
  fineractClientId: number;
  userType: string;
}

@Injectable()
export class FineractSignupService {
  private readonly logger = new Logger(FineractSignupService.name);

  constructor(
    private readonly keycloakService: KeycloakService,
    private readonly configService: ConfigService,
    private readonly fineractService: FineractService,
    private readonly creditScoreService: CreditScoreService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Wallet.name) private readonly walletModel: Model<Wallet>,
    @InjectModel(Notification.name) private readonly notificationModel: Model<Notification>,
  ) {}

  /**
   * Complete signup process (giống HD-AMC FineractSignupService + AuthService.confirmSignUp):
   * 0. Validate phone trùng (check MongoDB + Fineract)
   * 1. Create Keycloak user
   * 2. Assign role
   * 3. Create Fineract client (inactive)
   * 4. Save to MongoDB (inactive, kycStatus=NONE)
   * 5. Welcome notification
   * 6. Credit score init
   */
  async signup(data: SignupData): Promise<SignupResult> {
    const username = data.phoneNumber;
    const userType = data.userType || 'borrower';
    const emailDomain = this.configService.get<string>('defaults.emailDomain');

    // ── Step 0: Validate phone trùng (giống HD-AMC CheckPhoneController) ──
    await this._validatePhoneAvailability(username);

    try {
      // ── Step 1: Create Keycloak user ──
      this.logger.log(`[SIGNUP] Creating Keycloak user: ${username}`);
      const keycloakUserId = await this.keycloakService.createUser({
        username,
        email: data.email || `${data.phoneNumber}@${emailDomain}`,
        firstName: data.firstName,
        lastName: data.lastName,
        enabled: true,
        emailVerified: true,
        credentials: [{ type: 'password', value: data.password, temporary: false }],
        attributes: {
          phoneNumber: [data.phoneNumber],
          userType: [userType],
        },
      });

      // ── Step 2: Assign role ──
      await this.keycloakService.assignRole(keycloakUserId, userType);

      // ── Step 3: Create Fineract client (inactive - pending KYC approval) ──
      this.logger.log(`[SIGNUP] Creating Fineract client for: ${username}`);
      const fineractClientId = await this.fineractService.createClient({
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber,
        email: data.email,
        active: false, // Client inactive → active after admin approves KYC
      });

      if (!fineractClientId) {
        throw new Error('Không thể tạo Client trên Fineract');
      }

      this.logger.log(
        `[SIGNUP] Client ${fineractClientId} created (inactive). E-wallet will be created after KYC approval.`,
      );

      // ── Step 4: Save user to MongoDB ──
      const createdUser = await this.userModel.create({
        keycloakId: keycloakUserId,
        fineractClientId: fineractClientId.toString(),
        username,
        phoneNumber: data.phoneNumber,
        email: data.email || `${data.phoneNumber}@${emailDomain}`,
        profile: { firstName: data.firstName, lastName: data.lastName },
        status: UserStatus.INACTIVE, // Inactive until KYC approved
        userType: userType as UserType, // Top-level field
        kycStatus: 'NONE',
        metadata: {
          userType, // Giữ backward-compatible
          syncStatus: 'registered_pending_approval',
          registeredAt: new Date(),
        },
      });

      // ── Step 5: Welcome notification (giống HD-AMC NotificationHelper.notifyUser) ──
      this._sendWelcomeNotification(createdUser._id, userType).catch(err =>
        this.logger.warn(`[SIGNUP] Welcome notification failed: ${err.message}`),
      );

      // ── Step 6: Credit score init ──
      await this.creditScoreService.ensureCreditScoreForUser(createdUser._id);

      this.logger.log(`[SIGNUP] User saved to MongoDB. Wallet will be created after KYC approval.`);
      this.logger.log(`[SIGNUP] Completed for ${username} (${userType}) - Fineract client ${fineractClientId}`);
      return { username, keycloakUserId, fineractClientId, userType };
    } catch (error: any) {
      this.logger.error(`[SIGNUP] Failed for ${username}: ${error.message}`);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Check phone availability (for external use via AuthController)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Kiểm tra SĐT có sẵn sàng đăng ký không (giống HD-AMC CheckPhoneController)
   * Check cả MongoDB lẫn Fineract
   */
  async checkPhoneAvailability(phone: string): Promise<{ available: boolean; reason?: string }> {
    const normalized = this._normalizePhone(phone);
    if (!normalized || normalized.length < 10) {
      return { available: true }; // Chưa đủ dài, coi như available (client sẽ validate form)
    }

    // 1. Check MongoDB
    const existsInMongo = await this.userModel.exists({
      $or: [
        { username: normalized },
        { phoneNumber: normalized },
        { username: phone },
      ],
    });
    if (existsInMongo) {
      return { available: false, reason: 'Số điện thoại đã được đăng ký trên hệ thống' };
    }

    // 2. Check Fineract
    try {
      const client = await this.fineractService.findClientByIdentifier(normalized);
      if (client) {
        return { available: false, reason: 'Số điện thoại đã tồn tại trên hệ thống tài chính' };
      }
    } catch {
      // Fineract down → cho phép đăng ký, sẽ fail ở step 3
    }

    return { available: true };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════════

  private async _validatePhoneAvailability(phone: string): Promise<void> {
    const result = await this.checkPhoneAvailability(phone);
    if (!result.available) {
      throw new BadRequestException(result.reason || 'Số điện thoại đã được đăng ký');
    }
  }

  private _normalizePhone(phone: string): string {
    return (phone || '').replace(/\D/g, '').slice(-10);
  }

  private async _sendWelcomeNotification(userId: any, userType: string) {
    const roleLabel = userType === 'lender' ? 'Nhà đầu tư' : userType === 'staff' ? 'Nhân viên' : 'Người vay';
    await this.notificationModel.create({
      userId,
      title: 'Chào mừng bạn đến với P2P Lending!',
      message: `Chúc mừng bạn đã đăng ký tài khoản ${roleLabel} thành công. Hãy hoàn thành eKYC để bắt đầu sử dụng dịch vụ.`,
      type: 'general',
      read: false,
    });
  }
}
