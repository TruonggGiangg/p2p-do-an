/**
 * AdminKycService — KYC approval, OCR, document streaming
 * Extracted from AdminService for maintainability.
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

@Injectable()
export class AdminKycService {
  private readonly logger = new Logger(AdminKycService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Wallet.name) private walletModel: Model<Wallet>,
    private readonly fineractClientService: FineractClientService,
    private readonly fineractSavingsService: FineractSavingsService,
    private readonly keycloakService: KeycloakService,
    private readonly ekycService: EkycService,
  ) {}

  /** Danh sách user có kycStatus = PENDING */
  async getPendingKycUsers() {
    const users = await this.userModel
      .find({ kycStatus: 'PENDING' })
      .select('username email profile fineractClientId kycStatus kycData createdAt')
      .sort({ 'kycData.metadata.kycCompletedAt': -1 })
      .lean();

    return users.map((u: any) => ({
      _id: u._id?.toString(),
      username: u.username,
      email: u.email,
      profile: u.profile,
      fineractClientId: u.fineractClientId,
      kycStatus: u.kycStatus,
      kycCompletedAt: u.kycData?.metadata?.kycCompletedAt,
      displayName: [u.profile?.firstName, u.profile?.lastName].filter(Boolean).join(' ') || u.username,
    }));
  }

  /** Chi tiết KYC của user (OCR + danh sách tài liệu từ Fineract) */
  async getKycDetail(userId: string) {
    const user = await this.resolveUser(userId);
    const kycData = user.kycData || {};
    const metadata = kycData.metadata || {};
    const fineractClientDocs = metadata.fineractClientDocs || {};

    const documents: { id: number; name: string; entityType: string; entityId: number; label: string }[] = [];
    const clientId = user.fineractClientId ? parseInt(user.fineractClientId) : null;
    if (clientId) {
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
    }

    return {
      user: {
        _id: user._id?.toString(),
        username: user.username,
        email: user.email,
        profile: user.profile,
        fineractClientId: user.fineractClientId,
        kycStatus: user.kycStatus,
      },
      ocr: {
        fullName: kycData.fullName,
        ssn: kycData.ssn,
        dateOfBirth: kycData.dateOfBirth,
        address: kycData.address,
        sex: kycData.sex,
        issueDate: kycData.issueDate,
      },
      metadata: { kycCompletedAt: metadata.kycCompletedAt, fineractClientDocs },
      documents,
    };
  }

  /** Phê duyệt KYC: kích hoạt client trên Fineract + tạo savings account + cập nhật MongoDB + Keycloak */
  async approveKyc(userId: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(userId)) user = await this.userModel.findById(userId);
    if (!user) user = await this.userModel.findOne({ fineractClientId: userId });
    if (!user) throw new NotFoundException('Khách hàng không tồn tại');
    if (!['PENDING', 'NONE'].includes(user.kycStatus || 'NONE')) {
      throw new BadRequestException(`KYC đã ở trạng thái ${user.kycStatus}, không thể phê duyệt`);
    }

    // 1. Activate client on Fineract
    if (user.fineractClientId) {
      try {
        const clientIdNum = parseInt(user.fineractClientId);
        await this.fineractClientService.activateClient(clientIdNum);
        this.logger.log(`[approveKyc] Activated Fineract client ${clientIdNum}`);
      } catch (err: any) {
        this.logger.error(`[approveKyc] Failed to activate Fineract client: ${err.message}`);
        throw new BadRequestException(`Không thể kích hoạt client trên Fineract: ${err.message}`);
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

    return { kycStatus: 'VERIFIED', status: 'active', userId: user._id?.toString(), savingsAccountId: savingsAccountId?.toString() || null };
  }

  /** Từ chối KYC */
  async rejectKyc(userId: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(userId)) user = await this.userModel.findById(userId);
    if (!user) user = await this.userModel.findOne({ fineractClientId: userId });
    if (!user) throw new NotFoundException('Khách hàng không tồn tại');
    if (!['PENDING', 'NONE'].includes(user.kycStatus || 'NONE')) {
      throw new BadRequestException(`KYC đã ở trạng thái ${user.kycStatus}`);
    }

    user.kycStatus = 'REJECTED';
    await user.save();

    if (user.keycloakId) {
      try {
        await this.keycloakService.updateUser(user.keycloakId, { kycStatus: 'rejected' });
      } catch (err: any) {
        this.logger.warn(`[rejectKyc] Keycloak update failed: ${err.message}`);
      }
    }

    return { kycStatus: 'REJECTED', userId: user._id?.toString() };
  }

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

  private async resolveUser(userId: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(userId)) user = await this.userModel.findById(userId);
    if (!user) user = await this.userModel.findOne({ fineractClientId: userId });
    if (!user) throw new NotFoundException('Khách hàng không tồn tại');
    return user;
  }
}
