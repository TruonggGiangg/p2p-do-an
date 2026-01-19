import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserStatus } from '../../users/schemas/user.schema';
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
  ) {}

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

      // Step 3: Create Fineract client
      this.logger.log(`[SIGNUP] Creating Fineract client for: ${username}`);
      const fineractClientId = await this.fineractService.createClient({
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber,
        email: data.email,
      });

      // Step 4: Save to MongoDB
      await this.userModel.create({
        keycloakId: keycloakUserId,
        fineractClientId: fineractClientId.toString(),
        username,
        email: data.email || `${data.phoneNumber}@${emailDomain}`,
        profile: { firstName: data.firstName, lastName: data.lastName },
        status: UserStatus.ACTIVE,
        metadata: {
          userType,
          syncStatus: 'registered',
          registeredAt: new Date(),
        },
      });

      this.logger.log(`[SIGNUP] Completed for ${username}`);
      return { username, keycloakUserId, fineractClientId };
    } catch (error: any) {
      this.logger.error(`[SIGNUP] Failed for ${username}: ${error.message}`);
      throw error;
    }
  }
}
