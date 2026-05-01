/**
 * AdminKycService — KYC approval, OCR, document streaming, notifications
 * (Enhanced: requestUpdateKyc + reason + notifications — ported from HD-AMC AdminService)
 */
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FineractClientService } from '../../fineract/services/fineract-client.service';
import { FineractSavingsService } from '../../fineract/services/fineract-savings.service';
import { KeycloakService } from '../../auth/services/keycloak.service';
import { EkycService } from '../../ekyc/ekyc.service';
import { User } from '../../users/schemas/user.schema';
import { Wallet } from '../../wallets/schemas/wallet.schema';
import { Notification } from '../../loan/schemas/notification.schema';
import { PushNotificationService } from '../../loan/services/push-notification.service';

@Injectable()
export class AdminKycService {
  private readonly logger = new Logger(AdminKycService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Wallet.name) private walletModel: Model<Wallet>,
    @InjectModel(Notification.name) private notificationModel: Model<Notification>,
    private readonly fineractClientService: FineractClientService,
    private readonly fineractSavingsService: FineractSavingsService,
    private readonly keycloakService: KeycloakService,
    private readonly ekycService: EkycService,
    private readonly pushService: PushNotificationService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════
  // Query Methods
  // ═══════════════════════════════════════════════════════════════════

  /** Danh sách user có kycStatus = PENDING hoặc UPDATE_REQUESTED */
  async getPendingKycUsers() {
    const users = await this.userModel
      .find({ kycStatus: { $in: ['PENDING', 'UPDATE_REQUESTED'] } })
      .select('username email profile fineractClientId kycStatus kycRejectReason kycData createdAt')
      .sort({ 'kycData.metadata.kycCompletedAt': -1 })
      .lean();

    return users.map((u: any) => ({
      _id: u._id?.toString(),
      username: u.username,
      email: u.email,
      profile: u.profile,
      fineractClientId: u.fineractClientId,
      kycStatus: u.kycStatus,
      kycRejectReason: u.kycRejectReason || null,
      kycCompletedAt: u.kycData?.metadata?.kycCompletedAt,
      displayName: [u.profile?.firstName, u.profile?.lastName].filter(Boolean).join(' ') || u.username,
    }));
  }

  /** Chi tiết KYC của user (OCR + danh sách tài liệu từ Fineract clients + identifiers) */
  async getKycDetail(userId: string) {
    const user = await this.resolveUser(userId);
    const kycData = user.kycData || {};
    const metadata = kycData.metadata || {};
    const fineractIdentifiers = metadata.fineractIdentifiers || {};
    const fineractClientDocs = metadata.fineractClientDocs || {};

    const documents: { id: number; name: string; entityType: string; entityId: number; label: string }[] = [];
    const clientId = user.fineractClientId ? parseInt(user.fineractClientId) : null;

    if (clientId) {
      // 1. Tài liệu từ client documents
      const clientDocs = await this.fineractClientService.getEntityDocuments('clients', clientId);
      for (const d of clientDocs || []) {
        documents.push({
          id: d.id,
          name: d.name || d.fileName || 'document',
          entityType: 'clients',
          entityId: clientId,
          label: d.description || d.name || 'CCCD',
        });
      }

      // 2. Tài liệu từ client_identifiers (nếu có identifierId)
      if (fineractIdentifiers.identifierId) {
        try {
          const idDocs = await this.fineractClientService.getEntityDocuments(
            'client_identifiers', fineractIdentifiers.identifierId,
          );
          for (const d of idDocs || []) {
            // Tránh duplicate nếu cùng tên document
            const exists = documents.some(existing => existing.name === d.name);
            if (!exists) {
              documents.push({
                id: d.id,
                name: d.name || d.fileName || 'document',
                entityType: 'client_identifiers',
                entityId: fineractIdentifiers.identifierId,
                label: d.description || d.name || 'CCCD (Identifier)',
              });
            }
          }
        } catch (e: any) {
          this.logger.warn(`[getKycDetail] Failed to fetch identifier docs: ${e.message}`);
        }
      }
    }

    return {
      user: {
        _id: user._id?.toString(),
        username: user.username,
        email: user.email,
        profile: user.profile,
        fineractClientId: user.fineractClientId,
        kycStatus: user.kycStatus,
        kycRejectReason: (user as any).kycRejectReason || null,
      },
      ocr: {
        fullName: kycData.fullName,
        ssn: kycData.ssn,
        dateOfBirth: kycData.dateOfBirth,
        address: kycData.address,
        sex: kycData.sex,
        issueDate: kycData.issueDate,
      },
      metadata: {
        kycCompletedAt: metadata.kycCompletedAt,
        fineractIdentifiers,
        fineractClientDocs,
        faceMatchingResult: metadata.faceMatchingResult || null,
        livenessResult: metadata.livenessResult || null,
        // Back OCR metadata
        issueDate: metadata.issueDate,
        expiryDate: metadata.expiryDate,
        placeOfIssue: metadata.placeOfIssue,
        issuer: metadata.issuer || metadata.Issuer || null,
        placeOfBirth: metadata.placeOfBirth,
        personalIdentification: metadata.personalIdentification || metadata.personal_identification || null,
        mrz: metadata.mrz,
      },
      documents,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // KYC Approval Actions (giống HD-AMC AdminService.approveKYCOnly/rejectKYC/requestUpdateKYC)
  // ═══════════════════════════════════════════════════════════════════

  /** Phê duyệt KYC: kích hoạt client trên Fineract + tạo savings + cập nhật MongoDB + Keycloak + notification */
  async approveKyc(userId: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(userId)) user = await this.userModel.findById(userId);
    if (!user) user = await this.userModel.findOne({ fineractClientId: userId });
    if (!user) throw new NotFoundException('Khách hàng không tồn tại');
    if (!['PENDING', 'NONE', 'UPDATE_REQUESTED', 'VERIFIED'].includes(user.kycStatus || 'NONE')) {
      throw new BadRequestException(`KYC đã ở trạng thái ${user.kycStatus}, không thể phê duyệt`);
    }

    // 1. Activate client on Fineract
    if (user.fineractClientId) {
      try {
        const clientIdNum = parseInt(user.fineractClientId);
        await this.fineractClientService.activateClient(clientIdNum);
        this.logger.log(`[approveKyc] Activated Fineract client ${clientIdNum}`);
      } catch (err: any) {
        if (err.message && err.message.toLowerCase().includes('already active')) {
          this.logger.warn(`[approveKyc] Fineract client is already active. Bypassing and continuing to update MongoDB.`);
        } else {
          this.logger.error(`[approveKyc] Failed to activate Fineract client: ${err.message}`);
          throw new BadRequestException(`Không thể kích hoạt client trên Fineract: ${err.message}`);
        }
      }
    }

    // 2. Create savings account (e-wallet)
    let savingsAccountId: number | null = null;
    if (user.fineractClientId) {
      const existingWallet = await this.walletModel.findOne({ userId: user._id }).lean();
      if (existingWallet) {
        this.logger.log(`[approveKyc] User already has wallet ${existingWallet.fineractSavingsId}, skipping creation`);
        const parsed = parseInt(existingWallet.fineractSavingsId, 10);
        savingsAccountId = Number.isFinite(parsed) ? parsed : null;
      } else {
        try {
          const clientIdNum = parseInt(user.fineractClientId);
          savingsAccountId = await this.fineractSavingsService.createSavingsAccount(clientIdNum);
          this.logger.log(`[approveKyc] Created savings account ${savingsAccountId} for client ${clientIdNum}`);
          await this.walletModel.create({ userId: user._id, fineractSavingsId: savingsAccountId.toString() });
          this.logger.log(`[approveKyc] Created wallet reference in MongoDB for savings account ${savingsAccountId}`);
        } catch (err: any) {
          this.logger.error(`[approveKyc] Failed to create savings account: ${err.message}`);
        }
      }
    }

    // 3. Update MongoDB
    user.kycStatus = 'VERIFIED';
    user.status = 'active';
    user.kycRejectReason = null; // Clear reject reason
    await user.save();

    // 4. Update Keycloak
    if (user.keycloakId) {
      try {
        await this.keycloakService.updateUser(user.keycloakId, { kycStatus: 'verified', clientStatus: 'active' });
        this.logger.log(`[approveKyc] Updated Keycloak kycStatus and clientStatus for ${user.keycloakId}`);
      } catch (err: any) {
        this.logger.warn(`[approveKyc] Keycloak update failed: ${err.message}`);
      }
    }

    // 5. Notification (giống HD-AMC NotificationHelper.notifyUser)
    await this._notifyUser(
      user._id,
      'Phê duyệt eKYC thành công',
      'Hồ sơ xác thực danh tính của bạn đã được phê duyệt thành công. Bạn đã có thể bắt đầu sử dụng các dịch vụ tài chính.',
      'kyc_approved',
      user.pushToken,
    );

    return { kycStatus: 'VERIFIED', status: 'active', userId: user._id?.toString(), savingsAccountId: savingsAccountId?.toString() || null };
  }

  /** Từ chối KYC (có lý do — giống HD-AMC rejectKYC) */
  async rejectKyc(userId: string, reason?: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(userId)) user = await this.userModel.findById(userId);
    if (!user) user = await this.userModel.findOne({ fineractClientId: userId });
    if (!user) throw new NotFoundException('Khách hàng không tồn tại');
    if (!['PENDING', 'NONE', 'UPDATE_REQUESTED'].includes(user.kycStatus || 'NONE')) {
      throw new BadRequestException(`KYC đã ở trạng thái ${user.kycStatus}`);
    }

    user.kycStatus = 'REJECTED';
    user.kycRejectReason = reason || null;
    await user.save();

    if (user.keycloakId) {
      try {
        await this.keycloakService.updateUser(user.keycloakId, { kycStatus: 'rejected' });
      } catch (err: any) {
        this.logger.warn(`[rejectKyc] Keycloak update failed: ${err.message}`);
      }
    }

    // Notification
    const reasonMsg = reason ? ` Lý do: ${reason}.` : '';
    await this._notifyUser(
      user._id,
      'Hồ sơ eKYC bị từ chối',
      `Hồ sơ xác thực của bạn không được chấp thuận.${reasonMsg} Vui lòng thực hiện lại từ đầu.`,
      'kyc_rejected',
      user.pushToken,
      { deepLink: 'KYCUpdate' },
    );

    return { kycStatus: 'REJECTED', userId: user._id?.toString() };
  }

  /** Yêu cầu bổ sung hồ sơ eKYC (giống HD-AMC requestUpdateKYC) */
  async requestUpdateKyc(userId: string, reason: string) {
    if (!reason?.trim()) throw new BadRequestException('Vui lòng nhập nội dung cần cập nhật.');

    let user: any = null;
    if (Types.ObjectId.isValid(userId)) user = await this.userModel.findById(userId);
    if (!user) user = await this.userModel.findOne({ fineractClientId: userId });
    if (!user) throw new NotFoundException('Khách hàng không tồn tại');
    if (!['PENDING', 'NONE'].includes(user.kycStatus || 'NONE')) {
      throw new BadRequestException(`KYC đã ở trạng thái ${user.kycStatus}, không thể yêu cầu bổ sung`);
    }

    user.kycStatus = 'UPDATE_REQUESTED';
    user.kycRejectReason = reason;
    await user.save();

    if (user.keycloakId) {
      try {
        await this.keycloakService.updateUser(user.keycloakId, { kycStatus: 'update_requested' });
      } catch (err: any) {
        this.logger.warn(`[requestUpdateKyc] Keycloak update failed: ${err.message}`);
      }
    }

    // Notification
    await this._notifyUser(
      user._id,
      'Yêu cầu bổ sung hồ sơ eKYC',
      `Hệ thống yêu cầu bổ sung thông tin hồ sơ eKYC: ${reason}. Vui lòng kiểm tra và cập nhật lại.`,
      'kyc_update_requested',
      user.pushToken,
      { deepLink: 'KYCUpdate' },
    );

    return { kycStatus: 'UPDATE_REQUESTED', userId: user._id?.toString(), message: 'Đã gửi yêu cầu cập nhật hồ sơ' };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Document & OCR
  // ═══════════════════════════════════════════════════════════════════

  /** Stream tài liệu KYC từ Fineract */
  async getKycDocumentStream(userId: string, entityType: string, entityId: number, documentId: number) {
    const detail = await this.getKycDetail(userId);
    const doc = detail.documents.find(
      (d: any) => d.entityType === entityType && Number(d.entityId) === Number(entityId) && Number(d.id) === Number(documentId),
    );
    if (!doc) throw new NotFoundException('Tài liệu không tồn tại');
    return this.fineractClientService.downloadDocument(entityType, entityId, documentId);
  }

  /** OCR mặt trước CCCD */
  async ocrFrontForUser(userId: string, imageBuffer: Buffer, filename = 'front.jpg') {
    await this.resolveUser(userId);
    return this.ekycService.ocrFrontID(imageBuffer, filename);
  }

  /** OCR mặt sau CCCD */
  async ocrBackForUser(userId: string, imageBuffer: Buffer, filename = 'back.jpg') {
    await this.resolveUser(userId);
    return this.ekycService.ocrBackID(imageBuffer, filename);
  }

  /** Lưu KYC cho user (nhân viên làm giúp) */
  async saveKycForUser(
    userId: string,
    frontOCRData: any,
    backOCRData: any,
    frontImageBuffer: Buffer | null,
    backImageBuffer: Buffer | null,
  ) {
    const user = await this.resolveUser(userId);
    const mongoId = user._id?.toString();
    return this.ekycService.saveKycData(mongoId, frontOCRData, backOCRData, frontImageBuffer, backImageBuffer, null, null);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════════

  private async resolveUser(userId: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(userId)) user = await this.userModel.findById(userId);
    if (!user) user = await this.userModel.findOne({ fineractClientId: userId });
    if (!user) throw new NotFoundException('Khách hàng không tồn tại');
    return user;
  }

  /**
   * Tạo notification trong MongoDB + gửi push (giống HD-AMC NotificationHelper.notifyUser)
   */
  private async _notifyUser(
    userId: Types.ObjectId,
    title: string,
    message: string,
    type: string,
    pushToken?: string,
    data: Record<string, any> = {},
  ) {
    try {
      // 1. Persist notification in MongoDB
      await this.notificationModel.create({
        userId,
        title,
        message,
        type,
        read: false,
        data,
      });

      // 2. Send push notification (if token available)
      if (pushToken) {
        this.pushService.sendPushNotification(pushToken, title, message, data).catch(err =>
          this.logger.warn(`[_notifyUser] Push fail: ${err.message}`),
        );
      }
    } catch (err: any) {
      this.logger.warn(`[_notifyUser] Notification save failed: ${err.message}`);
    }
  }
}
