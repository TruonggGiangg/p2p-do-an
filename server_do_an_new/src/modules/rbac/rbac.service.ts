import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role } from './schemas/role.schema';
import { Permission } from './schemas/permission.schema';

/** All known actions (mirrors actions.enum.ts) */
export const ALL_ACTIONS = ['manage', 'create', 'read', 'update', 'delete', 'approve', 'disburse'] as const;

/** All known subjects (mirrors subjects.ts) */
export const ALL_SUBJECTS = [
  'LoanProduct',
  'SavingsProduct',
  'DocumentType',
  'SyncDrift',
  'Customer',
  'Loan',
  'LoanDocument',
  'Kyc',
  'Staff',
  'Migration',
  'LoanApplication',
  'all',
] as const;

@Injectable()
export class RbacService implements OnModuleInit {
  private readonly logger = new Logger(RbacService.name);

  constructor(
    @InjectModel(Role.name) private roleModel: Model<Role>,
    @InjectModel(Permission.name) private permModel: Model<Permission>,
  ) {}

  /** Seed default roles + permissions on first startup */
  async onModuleInit() {
    const count = await this.roleModel.countDocuments();
    if (count > 0) return; // already seeded

    this.logger.log('Seeding default roles & permissions …');

    // ── Admin role ──
    const admin = await this.roleModel.create({
      name: 'admin',
      description: 'Quản trị viên — toàn quyền hệ thống',
      isActive: true,
    });
    await this.permModel.create({ roleId: admin._id, action: 'manage', subject: 'all', allowed: true });

    // ── Staff role ──
    const staff = await this.roleModel.create({
      name: 'staff',
      description: 'Nhân viên — quyền xử lý nghiệp vụ',
      isActive: true,
    });

    const staffPerms: { action: string; subject: string; allowed: boolean }[] = [
      // can
      { action: 'read', subject: 'LoanProduct', allowed: true },
      { action: 'read', subject: 'SavingsProduct', allowed: true },
      { action: 'read', subject: 'DocumentType', allowed: true },
      { action: 'read', subject: 'Customer', allowed: true },
      { action: 'read', subject: 'Kyc', allowed: true },
      { action: 'approve', subject: 'Kyc', allowed: true },
      { action: 'create', subject: 'Kyc', allowed: true },
      { action: 'update', subject: 'Kyc', allowed: true },
      { action: 'read', subject: 'Loan', allowed: true },
      { action: 'approve', subject: 'Loan', allowed: true },
      { action: 'disburse', subject: 'Loan', allowed: true },
      { action: 'read', subject: 'LoanDocument', allowed: true },
      { action: 'approve', subject: 'LoanDocument', allowed: true },
      { action: 'update', subject: 'LoanDocument', allowed: true },
      { action: 'read', subject: 'LoanApplication', allowed: true },
      { action: 'update', subject: 'LoanApplication', allowed: true },
      // cannot
      { action: 'manage', subject: 'Staff', allowed: false },
      { action: 'manage', subject: 'SyncDrift', allowed: false },
      { action: 'manage', subject: 'Migration', allowed: false },
    ];

    await this.permModel.insertMany(staffPerms.map(p => ({ ...p, roleId: staff._id })));
    this.logger.log('Default roles & permissions seeded');
  }

  // ═══════════════════════ ROLE CRUD ═══════════════════════

  async listRoles() {
    return this.roleModel.find().sort({ name: 1 }).lean();
  }

  async createRole(name: string, description = '') {
    const exists = await this.roleModel.findOne({ name });
    if (exists) throw new ConflictException(`Role "${name}" đã tồn tại`);
    return this.roleModel.create({ name, description });
  }

  async updateRole(id: string, body: { name?: string; description?: string; isActive?: boolean }) {
    const role = await this.roleModel.findById(id);
    if (!role) throw new NotFoundException('Role không tồn tại');
    if (body.name) role.name = body.name;
    if (body.description !== undefined) role.description = body.description;
    if (body.isActive !== undefined) role.isActive = body.isActive;
    return role.save();
  }

  async deleteRole(id: string) {
    const role = await this.roleModel.findById(id);
    if (!role) throw new NotFoundException('Role không tồn tại');
    await this.permModel.deleteMany({ roleId: role._id });
    await role.deleteOne();
    return { deleted: true };
  }

  // ═══════════════════ PERMISSION CRUD ════════════════════

  /** Get all permissions for a role */
  async getPermissionsByRole(roleId: string) {
    return this.permModel.find({ roleId: new Types.ObjectId(roleId) }).lean();
  }

  /**
   * Bulk-set permissions for a role (replace all).
   * Expects array of { action, subject, allowed }
   */
  async setPermissions(roleId: string, perms: { action: string; subject: string; allowed: boolean }[]) {
    const role = await this.roleModel.findById(roleId);
    if (!role) throw new NotFoundException('Role không tồn tại');

    // Validate
    for (const p of perms) {
      if (!ALL_ACTIONS.includes(p.action as any)) throw new BadRequestException(`Action "${p.action}" không hợp lệ`);
      if (!ALL_SUBJECTS.includes(p.subject as any))
        throw new BadRequestException(`Subject "${p.subject}" không hợp lệ`);
    }

    // Delete old, insert new
    await this.permModel.deleteMany({ roleId: role._id });
    if (perms.length > 0) {
      await this.permModel.insertMany(perms.map(p => ({ ...p, roleId: role._id })));
    }
    return this.permModel.find({ roleId: role._id }).lean();
  }

  /**
   * Toggle a single permission on/off.
   */
  async togglePermission(roleId: string, action: string, subject: string, allowed: boolean) {
    const role = await this.roleModel.findById(roleId);
    if (!role) throw new NotFoundException('Role không tồn tại');

    if (!ALL_ACTIONS.includes(action as any)) throw new BadRequestException(`Action "${action}" không hợp lệ`);
    if (!ALL_SUBJECTS.includes(subject as any)) throw new BadRequestException(`Subject "${subject}" không hợp lệ`);

    const existing = await this.permModel.findOne({
      roleId: role._id,
      action,
      subject,
    });

    if (existing) {
      existing.allowed = allowed;
      return existing.save();
    }
    return this.permModel.create({ roleId: role._id, action, subject, allowed });
  }

  // ═══════════════════ CASL RULES BUILDER ═════════════════

  /**
   * Build CASL-compatible rules array for a set of role names.
   * Returns format: [{ action, subject, inverted? }]
   * which can be fed into PureAbility constructor.
   */
  async buildRulesForRoles(roleNames: string[]): Promise<{ action: string; subject: string; inverted?: boolean }[]> {
    const roles = await this.roleModel.find({ name: { $in: roleNames }, isActive: true }).lean();
    if (roles.length === 0) return [];

    const roleIds = roles.map(r => r._id);
    const perms = await this.permModel.find({ roleId: { $in: roleIds } }).lean();

    return perms.map(p => ({
      action: p.action,
      subject: p.subject,
      ...(p.allowed ? {} : { inverted: true }),
    }));
  }

  /** Metadata for frontend: list of all actions and subjects */
  getMetadata() {
    return {
      actions: [...ALL_ACTIONS],
      subjects: ALL_SUBJECTS.filter(s => s !== 'all'),
    };
  }
}
