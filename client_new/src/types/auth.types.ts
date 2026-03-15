// ==================== USER TYPES ====================

export interface UserProfile {
  firstName: string;
  lastName: string;
  avatar?: string;
}

export interface UserMetadata {
  syncStatus?:
    | "registered"
    | "synced"
    | "no_fineract_client"
    | "no_wallets"
    | "complete"
    | "incomplete"
    | "partial";
  syncError?: string;
  lastSyncAt?: string;
  userType?: "borrower" | "lender";
  registeredAt?: string;
  // Phone number is the external ID across systems (Keycloak username, Fineract externalId/mobileNo)
  phone?: string;
}

export interface UserCreditScore {
  score: number;
  totalLoans: number;
  latePayments: number;
  lastUpdated?: string;
}

export interface UserCreditScoreHistoryItem {
  _id?: string;
  beforeScore: number | null;
  afterScore: number;
  changeAmount: number;
  reason:
    | "initial_account_creation"
    | "loan_repayment"
    | "late_payment"
    | "manual_adjustment"
    | "system_recalculation";
  trigger?: string;
  note?: string;
  createdAt?: string;
}

export interface User {
  _id?: string;
  keycloakUserId?: string;
  fineractClientId?: string | number;
  username: string;
  email?: string;
  name?: string;
  roles?: string[];
  profile?: UserProfile;
  metadata?: UserMetadata;
  status?: "active" | "inactive" | "suspended";
  kycStatus?: "NONE" | "PENDING" | "VERIFIED" | "REJECTED";
  hasPin?: boolean;
  creditScore?: UserCreditScore | null;
  creditScoreHistory?: UserCreditScoreHistoryItem[];
  createdAt?: string;
  updatedAt?: string;
}

// ==================== WALLET TYPES ====================

export type WalletType = "credit_wallet" | "e_wallet";
export type WalletStatus = "active" | "locked";

export interface Wallet {
  _id?: string;
  id?: string;
  userId?: string;
  fineractSavingsId?: string;
  fineractId?: string;
  accountNo?: string;
  productId?: number;
  productName?: string;
  type: WalletType;
  currency?: string;
  balance: number;
  status?: WalletStatus | string;
  isDefault?: boolean;
  metadata?: {
    productName?: string;
    accountNo?: string;
    syncedFromFineract?: boolean;
  };
  createdAt?: string;
  updatedAt?: string;
}

// ==================== AUTH TYPES ====================

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  username: string;
  password: string;
  twoFactorToken?: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email?: string;
  password: string;
  userType?: "borrower" | "lender";
}

export interface LoginResponse {
  statusCode?: number;
  success?: boolean;
  message: string;
  data?: User;
  accessToken?: string;
  refreshToken?: string;
  requires2fa?: boolean;
}

export interface RegisterResponse {
  statusCode: number;
  message: string;
  data: {
    username: string;
    keycloakUserId: string;
    fineractClientId: number;
  };
}

export interface RefreshResponse {
  statusCode: number;
  data: {
    accessToken: string;
  } & User;
}

// ==================== API RESPONSE TYPES ====================

export interface ApiResponse<T> {
  statusCode: number;
  message: string;
  data: T;
}

export interface WalletsResponse {
  wallets: Wallet[];
  totalBalance: number;
}
