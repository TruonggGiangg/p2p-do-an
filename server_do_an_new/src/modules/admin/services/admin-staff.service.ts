/**
 * AdminStaffService — Staff CRUD, profile, preferences, support requests
 * Extracted from AdminService for maintainability.
 */
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FineractClientService } from '../../fineract/services/fineract-client.service';
import { FineractLoanService } from '../../fineract/services/fineract-loan.service';
import { KeycloakService } from '../../auth/services/keycloak.service';
import { KeycloakAuthService } from '../../auth/services/keycloak-auth.service';
import { FineractSignupService } from '../../auth/services/fineract-signup.service';
import { User } from '../../users/schemas/user.schema';
import { LoanApplication } from '../../loan/schemas/loan-application.schema';
import { LoanSupportRequest } from '../../loan/schemas/loan-support-request.schema';
import { Role } from '../../rbac/schemas/role.schema';
import { RegisterDto } from '../../auth/dto/register.dto';
import { UpdateStaffDto } from '../dto/update-staff.dto';
import {
  CreateCreditScoreWeightConfigInput,
  CreditScoreService,
  CreditScoreWeightConfigItem,
  CreditScoreWeightConfigInput,
  CreditScoreWeightConfigValue,
  UpdateCreditScoreWeightConfigInput,
} from '../../credit-score/credit-score.service';

@Injectable()
export class AdminStaffService {
  private readonly logger = new Logger(AdminStaffService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(LoanApplication.name) private loanApplicationModel: Model<LoanApplication>,
    @InjectModel(LoanSupportRequest.name) private supportRequestModel: Model<LoanSupportRequest>,
    @InjectModel(Role.name) private roleModel: Model<Role>,
    private readonly fineractClientService: FineractClientService,
    private readonly fineractLoanService: FineractLoanService,
    private readonly fineractSignupService: FineractSignupService,
    private readonly keycloakService: KeycloakService,
    private readonly keycloakAuthService: KeycloakAuthService,
    private readonly creditScoreService: CreditScoreService,
  ) {}

  // ── Credit Score ──────────────────────────────────────────────────────────
  async getCreditScoreWeightConfig(): Promise<CreditScoreWeightConfigValue> {
    return this.creditScoreService.getWeightConfig();
  }

  async updateCreditScoreWeightConfig(input: CreditScoreWeightConfigInput) {
    return this.creditScoreService.upsertWeightConfig(input);
  }

  async listCreditScoreWeightConfigs(): Promise<CreditScoreWeightConfigItem[]> {
    return this.creditScoreService.listWeightConfigs();
  }

  async createCreditScoreWeightConfig(input: CreateCreditScoreWeightConfigInput): Promise<CreditScoreWeightConfigItem> {
    return this.creditScoreService.createWeightConfig(input);
  }

  async updateCreditScoreWeightConfigById(
    id: string,
    input: UpdateCreditScoreWeightConfigInput,
  ): Promise<CreditScoreWeightConfigItem> {
    return this.creditScoreService.updateWeightConfig(id, input);
  }

  async applyCreditScoreWeightConfig(id: string): Promise<CreditScoreWeightConfigItem> {
    return this.creditScoreService.applyWeightConfig(id);
  }

  // ── Staff CRUD ────────────────────────────────────────────────────────────
  async createStaff(dto: RegisterDto) {
    dto.userType = 'staff';
    if (!dto.roleId) throw new BadRequestException('Thiếu roleId khi tạo nhân viên');

    const role = await this.roleModel.findById(dto.roleId).lean();
    if (!role || !role.isActive) throw new BadRequestException('Vai trò không hợp lệ hoặc đã bị vô hiệu hóa');

    this.logger.log(`[createStaff] Creating staff: ${dto.phoneNumber}`);
    const result = await this.fineractSignupService.signup(dto);

    try {
      const user = await this.userModel.findOne({ username: dto.phoneNumber });
      if (user) {
        user.phoneNumber = dto.phoneNumber;
        user.set('roles', [role.name]);
        user.metadata = {
          ...(user.metadata || {}),
          roleId: role._id?.toString(),
          roleIds: [role._id?.toString()],
          roleName: role.name,
          roleNames: [role.name],
        };
        user.markModified('metadata');
        await user.save();
      }
    } catch (err: any) {
      this.logger.warn(`[createStaff] Failed to set phoneNumber: ${err.message}`);
    }

    return { message: 'Đăng ký thành công', data: result };
  }

  async getStaffList(page = 1, limit = 20, keyword?: string) {
    const filter: any = { 'metadata.userType': 'staff', isDeleted: { $ne: true } };
    if (keyword) {
      const q = keyword.toLowerCase();
      filter.$or = [
        { username: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { phoneNumber: { $regex: q, $options: 'i' } },
        { 'profile.firstName': { $regex: q, $options: 'i' } },
        { 'profile.lastName': { $regex: q, $options: 'i' } },
      ];
    }

    const total = await this.userModel.countDocuments(filter);
    const skip = (page - 1) * limit;
    const users = await this.userModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();

    const staffList = users.map((u: any) => ({
      _id: u._id?.toString(),
      username: u.username,
      email: u.email || null,
      profile: u.profile || {},
      status: u.status,
      keycloakId: u.keycloakId,
      fineractClientId: u.fineractClientId || null,
      fineractStaffId: u.metadata?.fineractStaffId ?? null,
      roleId: u.metadata?.roleId ?? (Array.isArray(u.metadata?.roleIds) ? u.metadata.roleIds[0] : null),
      roleName: u.metadata?.roleName ?? (Array.isArray(u.metadata?.roleNames) ? u.metadata.roleNames[0] : null),
      phoneNumber: u.phoneNumber || u.username || null,
      displayName: [u.profile?.firstName, u.profile?.lastName].filter(Boolean).join(' ') || u.username,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      isDeleted: u.isDeleted || false,
    }));

    const deletedCount = await this.userModel.countDocuments({ 'metadata.userType': 'staff', isDeleted: true });
    return { staff: staffList, total, page, limit, deletedCount };
  }

  async getDeletedStaffList(page = 1, limit = 20) {
    const filter: any = { 'metadata.userType': 'staff', isDeleted: true };
    const total = await this.userModel.countDocuments(filter);
    const skip = (page - 1) * limit;
    const users = await this.userModel.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean();

    const staffList = users.map((u: any) => ({
      _id: u._id?.toString(),
      username: u.username,
      email: u.email || null,
      profile: u.profile || {},
      status: u.status,
      keycloakId: u.keycloakId,
      fineractClientId: u.fineractClientId || null,
      fineractStaffId: u.metadata?.fineractStaffId ?? null,
      roleId: u.metadata?.roleId ?? (Array.isArray(u.metadata?.roleIds) ? u.metadata.roleIds[0] : null),
      roleName: u.metadata?.roleName ?? (Array.isArray(u.metadata?.roleNames) ? u.metadata.roleNames[0] : null),
      phoneNumber: u.phoneNumber || u.username || null,
      displayName: [u.profile?.firstName, u.profile?.lastName].filter(Boolean).join(' ') || u.username,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      isDeleted: true,
    }));
    return { staff: staffList, total, page, limit };
  }

  async getStaffById(staffId: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(staffId)) {
      user = await this.userModel.findOne({ _id: staffId, 'metadata.userType': 'staff' }).lean();
    }
    if (!user) {
      user = await this.userModel.findOne({ username: staffId, 'metadata.userType': 'staff' }).lean();
    }
    if (!user) throw new NotFoundException('Nhân viên không tồn tại');

    return {
      _id: user._id?.toString(),
      username: user.username,
      email: user.email || null,
      profile: user.profile || {},
      status: user.status,
      keycloakId: user.keycloakId,
      fineractClientId: user.fineractClientId || null,
      fineractStaffId: user.metadata?.fineractStaffId ?? null,
      roleId: user.metadata?.roleId ?? (Array.isArray(user.metadata?.roleIds) ? user.metadata.roleIds[0] : null),
      roleName:
        user.metadata?.roleName ?? (Array.isArray(user.metadata?.roleNames) ? user.metadata.roleNames[0] : null),
      phoneNumber: user.phoneNumber || user.username || null,
      displayName: [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(' ') || user.username,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      metadata: user.metadata,
      isDeleted: user.isDeleted || false,
    };
  }

  async updateStaff(staffId: string, dto: UpdateStaffDto) {
    let user: any = null;
    if (Types.ObjectId.isValid(staffId)) {
      user = await this.userModel.findOne({ _id: staffId, 'metadata.userType': 'staff' });
    }
    if (!user) {
      user = await this.userModel.findOne({ username: staffId, 'metadata.userType': 'staff' });
    }
    if (!user) throw new NotFoundException('Nhân viên không tồn tại');

    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      if (dto.firstName !== undefined) user.profile.firstName = dto.firstName;
      if (dto.lastName !== undefined) user.profile.lastName = dto.lastName;
    }
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.status !== undefined) user.status = dto.status;
    if (dto.phoneNumber !== undefined) user.phoneNumber = dto.phoneNumber;
    user.markModified('profile');
    await user.save();

    if (user.keycloakId && (dto.firstName || dto.lastName || dto.email)) {
      try {
        const token = await (this.keycloakService as any).getAdminToken();
        const realm = (this.keycloakService as any).realm;
        const userRes = await (this.keycloakService as any).httpClient.get(
          `/admin/realms/${realm}/users/${user.keycloakId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const kcUser = userRes.data;
        if (dto.firstName) kcUser.firstName = dto.firstName;
        if (dto.lastName) kcUser.lastName = dto.lastName;
        if (dto.email) kcUser.email = dto.email;
        await (this.keycloakService as any).httpClient.put(`/admin/realms/${realm}/users/${user.keycloakId}`, kcUser, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        this.logger.log(`[updateStaff] Updated Keycloak user ${user.keycloakId}`);
      } catch (err: any) {
        this.logger.warn(`[updateStaff] Keycloak update failed: ${err.message}`);
      }
    }

    const fineractStaffId = user.metadata?.fineractStaffId;
    if (fineractStaffId && (dto.firstName || dto.lastName || dto.email)) {
      try {
        const fineractClient = this.fineractClientService['client'];
        const payload: any = {};
        if (dto.firstName) payload.firstname = dto.firstName;
        if (dto.lastName) payload.lastname = dto.lastName;
        if (dto.email) payload.emailAddress = dto.email;
        await fineractClient.put(`/staff/${fineractStaffId}`, payload);
        this.logger.log(`[updateStaff] Updated Fineract staff ${fineractStaffId}`);
      } catch (err: any) {
        this.logger.warn(`[updateStaff] Fineract staff update failed: ${err.message}`);
      }
    }

    return this.getStaffById(user._id.toString());
  }

  async deleteStaff(staffId: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(staffId)) {
      user = await this.userModel.findOne({ _id: staffId, 'metadata.userType': 'staff' });
    }
    if (!user) user = await this.userModel.findOne({ username: staffId, 'metadata.userType': 'staff' });
    if (!user) throw new NotFoundException('Nhân viên không tồn tại');

    if (user.keycloakId) {
      try {
        const token = await (this.keycloakService as any).getAdminToken();
        const realm = (this.keycloakService as any).realm;
        const userRes = await (this.keycloakService as any).httpClient.get(
          `/admin/realms/${realm}/users/${user.keycloakId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const kcUser = userRes.data;
        kcUser.enabled = false;
        await (this.keycloakService as any).httpClient.put(`/admin/realms/${realm}/users/${user.keycloakId}`, kcUser, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        this.logger.log(`[deleteStaff] Disabled Keycloak user ${user.keycloakId}`);
      } catch (err: any) {
        this.logger.warn(`[deleteStaff] Keycloak disable failed: ${err.message}`);
      }
    }

    user.isDeleted = true;
    user.status = 'suspended';
    await user.save();
    this.logger.log(`[deleteStaff] Soft deleted staff ${user._id}`);
    return { deleted: true, staffId: user._id?.toString() };
  }

  async restoreStaff(staffId: string) {
    let user: any = null;
    if (Types.ObjectId.isValid(staffId)) {
      user = await this.userModel.findOne({ _id: staffId, 'metadata.userType': 'staff', isDeleted: true });
    }
    if (!user)
      user = await this.userModel.findOne({ username: staffId, 'metadata.userType': 'staff', isDeleted: true });
    if (!user) throw new NotFoundException('Nhân viên không tồn tại hoặc chưa bị khóa');

    if (user.keycloakId) {
      try {
        const token = await (this.keycloakService as any).getAdminToken();
        const realm = (this.keycloakService as any).realm;
        const userRes = await (this.keycloakService as any).httpClient.get(
          `/admin/realms/${realm}/users/${user.keycloakId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const kcUser = userRes.data;
        kcUser.enabled = true;
        await (this.keycloakService as any).httpClient.put(`/admin/realms/${realm}/users/${user.keycloakId}`, kcUser, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        this.logger.log(`[restoreStaff] Re-enabled Keycloak user ${user.keycloakId}`);
      } catch (err: any) {
        this.logger.warn(`[restoreStaff] Keycloak re-enable failed: ${err.message}`);
      }
    }

    user.isDeleted = false;
    user.status = 'active';
    await user.save();
    this.logger.log(`[restoreStaff] Restored staff ${user._id}`);
    return this.getStaffById(user._id.toString());
  }

  async migratePhoneNumbers() {
    const result = await this.userModel.updateMany(
      { $or: [{ phoneNumber: { $exists: false } }, { phoneNumber: null }, { phoneNumber: '' }] },
      [{ $set: { phoneNumber: '$username' } }],
    );
    this.logger.log(`[migratePhoneNumbers] Updated ${result.modifiedCount} users`);
    return { modifiedCount: result.modifiedCount };
  }

  // ── Self-service Profile & Password ───────────────────────────────────────
  async getMyProfile(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    return {
      _id: user._id?.toString(),
      username: user.username,
      email: user.email || '',
      phoneNumber: user.phoneNumber || user.username || '',
      profile: user.profile || {},
      roles: (user as any).roles || [],
    };
  }

  async updateMyProfile(
    userId: string,
    dto: { firstName?: string; lastName?: string; email?: string; phoneNumber?: string },
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    if (dto.firstName !== undefined) user.profile.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.profile.lastName = dto.lastName;
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.phoneNumber !== undefined) user.phoneNumber = dto.phoneNumber;
    user.markModified('profile');
    await user.save();

    if (user.keycloakId && (dto.firstName || dto.lastName || dto.email)) {
      try {
        const token = await (this.keycloakService as any).getAdminToken();
        const realm = (this.keycloakService as any).realm;
        const userRes = await (this.keycloakService as any).httpClient.get(
          `/admin/realms/${realm}/users/${user.keycloakId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const kcUser = userRes.data;
        if (dto.firstName) kcUser.firstName = dto.firstName;
        if (dto.lastName) kcUser.lastName = dto.lastName;
        if (dto.email) kcUser.email = dto.email;
        await (this.keycloakService as any).httpClient.put(`/admin/realms/${realm}/users/${user.keycloakId}`, kcUser, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        this.logger.log(`[updateMyProfile] Synced Keycloak user ${user.keycloakId}`);
      } catch (err: any) {
        this.logger.warn(`[updateMyProfile] Keycloak sync failed: ${err.message}`);
      }
    }

    return {
      _id: user._id?.toString(),
      username: user.username,
      email: user.email,
      phoneNumber: user.phoneNumber,
      profile: user.profile,
    };
  }

  async changeMyPassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    if (!user.keycloakId) throw new BadRequestException('Tài khoản không liên kết Keycloak');
    try {
      await this.keycloakAuthService.loginWithPassword(user.username, currentPassword);
    } catch {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }
    await this.keycloakService.resetUserPassword(user.keycloakId, newPassword);
    return { success: true };
  }

  // ── Preferences ───────────────────────────────────────────────────────────
  async getMyPreferences(userId: string) {
    const user = await this.userModel.findById(userId).select('preferences').lean();
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    return user.preferences || { fontSize: 'default' };
  }

  async updateMyPreferences(userId: string, prefs: { fontSize?: 'compact' | 'default' | 'large' }) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    const validSizes = ['compact', 'default', 'large'];
    if (prefs.fontSize && !validSizes.includes(prefs.fontSize)) {
      throw new BadRequestException(`fontSize phải là một trong: ${validSizes.join(', ')}`);
    }
    user.preferences = {
      ...(user.preferences || { fontSize: 'default' }),
      ...(prefs.fontSize ? { fontSize: prefs.fontSize } : {}),
    };
    user.markModified('preferences');
    await user.save();
    return user.preferences;
  }

  // ── Support Requests ──────────────────────────────────────────────────────
  async getSupportRequests(query: any) {
    const filter: any = {};
    if (query.status) filter.status = query.status;
    if (query.requestType) filter.requestType = query.requestType;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const [items, total] = await Promise.all([
      this.supportRequestModel
        .find(filter)
        .populate('userId', 'username email fullName phoneNumber')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.supportRequestModel.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }

  async approveWaivePenalty(requestId: string, adminId: string) {
    const request = await this.supportRequestModel.findById(requestId);
    if (!request || request.requestType !== 'WAIVE_PENALTY' || request.status !== 'PENDING') {
      throw new BadRequestException('Yêu cầu không hợp lệ hoặc đã được xử lý');
    }
    await this.fineractLoanService.waiveAllPenalties(request.fineractLoanId);
    request.status = 'APPROVED';
    request.resolvedBy = new Types.ObjectId(adminId);
    request.resolvedAt = new Date();
    await request.save();
    return request;
  }

  async approveReschedule(requestId: string, adminId: string, adminNote?: string) {
    const request = await this.supportRequestModel.findById(requestId);
    if (!request || request.requestType !== 'RESCHEDULE' || request.status !== 'PENDING') {
      throw new BadRequestException('Yêu cầu không hợp lệ hoặc đã được xử lý');
    }
    if (!request.proposedRescheduleDate) {
      throw new BadRequestException('Thiếu thông tin ngày đến hạn mới để cơ cấu nợ');
    }

    const loanDetails = await this.fineractLoanService.getLoanDetails(String(request.fineractLoanId));
    let rescheduleFromDate = new Date().toISOString().split('T')[0];
    if (loanDetails?.repaymentSchedule?.periods) {
      const firstUnpaid = loanDetails.repaymentSchedule.periods.find((p: any) => p.period > 0 && !p.complete);
      if (firstUnpaid?.dueDate) {
        const dateArr = firstUnpaid.dueDate;
        rescheduleFromDate = Array.isArray(dateArr)
          ? `${dateArr[0]}-${String(dateArr[1]).padStart(2, '0')}-${String(dateArr[2]).padStart(2, '0')}`
          : dateArr;
      }
    }

    await this.fineractLoanService.rescheduleLoan(request.fineractLoanId, {
      rescheduleFromDate,
      adjustedDueDate: request.proposedRescheduleDate,
      rescheduleReasonId: 1,
    });

    request.status = 'APPROVED';
    request.resolvedBy = new Types.ObjectId(adminId);
    request.resolvedAt = new Date();
    request.adminNote = adminNote || 'Approved Reschedule';
    await request.save();
    return request;
  }

  async approveWriteOff(requestId: string, adminId: string, adminNote?: string) {
    const request = await this.supportRequestModel.findById(requestId);
    if (!request || request.requestType !== 'WRITE_OFF' || request.status !== 'PENDING') {
      throw new BadRequestException('Yêu cầu không hợp lệ hoặc đã được xử lý');
    }
    await this.fineractLoanService.writeOffLoan(request.fineractLoanId, adminNote || request.reason);
    request.status = 'APPROVED';
    request.resolvedBy = new Types.ObjectId(adminId);
    request.resolvedAt = new Date();
    request.adminNote = adminNote || 'Approved Write-off';
    await request.save();

    const app = await this.loanApplicationModel.findOne({ fineractLoanId: request.fineractLoanId });
    if (app) {
      app.status = 'closed' as any;
      await app.save();
    }
    return request;
  }

  async approveWaiveInterest(requestId: string, adminId: string, adminNote?: string) {
    const request = await this.supportRequestModel.findById(requestId);
    if (!request || request.requestType !== 'WAIVE_INTEREST' || request.status !== 'PENDING') {
      throw new BadRequestException('Yêu cầu không hợp lệ hoặc đã được xử lý');
    }
    await this.fineractLoanService.waiveInterest(request.fineractLoanId, { note: adminNote || request.reason });
    request.status = 'APPROVED';
    request.resolvedBy = new Types.ObjectId(adminId);
    request.resolvedAt = new Date();
    request.adminNote = adminNote || 'Approved Interest Waiver';
    await request.save();
    return request;
  }
}
