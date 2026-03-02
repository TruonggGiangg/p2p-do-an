import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserStatus } from '../../users/schemas/user.schema';
import { Wallet } from '../../wallets/schemas/wallet.schema';
import { KeycloakService } from './keycloak.service';
import { FineractService } from '../../fineract/fineract.service';

export interface SignupData {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email?: string;
  password: string;
  userType?: 'borrower' | 'lender';
}

export interface SignupResult {
  username: string;
  keycloakUserId: string;
  fineractClientId: number;
}

@Injectable()
export class FineractSignupService {
  private readonly logger = new Logger(FineractSignupService.name);

  constructor(
    private readonly keycloakService: KeycloakService,
    private readonly configService: ConfigService,
    private readonly fineractService: FineractService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Wallet.name) private readonly walletModel: Model<Wallet>,
  ) { }

  /**
   * Complete signup process:
   * 1. Create Keycloak user
   * 2. Assign role
   * 3. Create Fineract client
   * 4. Save to MongoDB
   */
  async signup(data: SignupData): Promise<SignupResult> {
    const username = data.phoneNumber;
    const userType = data.userType || 'borrower';
    const emailDomain = this.configService.get<string>('defaults.emailDomain');

    try {
      // Step 1: Create Keycloak user
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
        },
      });

      // Step 2: Assign role
      await this.keycloakService.assignRole(keycloakUserId, userType);

      // Step 3: Create Fineract client (inactive - pending approval)
      this.logger.log(`[SIGNUP] Creating Fineract client for: ${username}`);
      const fineractClientId = await this.fineractService.createClient({
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber,
        email: data.email,
        active: false, // Client created as inactive, pending admin approval
      });

      if (!fineractClientId) {
        throw new Error('Không thể tạo Client trên Fineract');
      }

      // Note: Savings account will be created after admin approves KYC
      // Because Fineract requires client to be active before creating savings account
      this.logger.log(`[SIGNUP] Client ${fineractClientId} created (inactive). E-wallet will be created after KYC approval.`);

      // Step 4: Save user to MongoDB (inactive status - pending KYC and approval)
      const mongoUser = await this.userModel.create({
        keycloakId: keycloakUserId,
        fineractClientId: fineractClientId.toString(),
        username,
        email: data.email || `${data.phoneNumber}@${emailDomain}`,
        profile: { firstName: data.firstName, lastName: data.lastName },
        status: UserStatus.INACTIVE, // User starts as inactive until KYC is approved
        kycStatus: 'NONE',
        metadata: {
          userType,
          syncStatus: 'registered_pending_approval',
          registeredAt: new Date(),
        },
      });

      // No wallet created yet - will be created after KYC approval
      this.logger.log(`[SIGNUP] User saved to MongoDB. Wallet will be created after KYC approval.`);

      this.logger.log(`[SIGNUP] Completed for ${username} - Created client ${fineractClientId} (pending approval)`);
      return { username, keycloakUserId, fineractClientId };
    } catch (error: any) {
      this.logger.error(`[SIGNUP] Failed for ${username}: ${error.message}`);
      throw error;
    }
  }
}
