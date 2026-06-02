/**
 * Mock Factory — Centralized mock objects cho toàn bộ test suite.
 * Sử dụng trong mọi *.spec.ts thay vì tạo mock riêng lẻ.
 */

// ──────────────────────────────────────────────────────────
//  MONGOOSE MODEL MOCK
// ──────────────────────────────────────────────────────────

export interface MockModel<T = any> {
  find: jest.Mock;
  findOne: jest.Mock;
  findById: jest.Mock;
  findByIdAndUpdate: jest.Mock;
  findOneAndUpdate: jest.Mock;
  create: jest.Mock;
  updateOne: jest.Mock;
  updateMany: jest.Mock;
  deleteOne: jest.Mock;
  countDocuments: jest.Mock;
  collection: { dropIndex: jest.Mock };
  new: jest.Mock;
}

/**
 * Tạo mock Mongoose Model với chainable methods (select, lean, exec, sort, skip, limit).
 * @param returnValue - Giá trị trả về mặc định từ exec()
 */
export function createMockModel<T = any>(returnValue: any = null): MockModel<T> {
  const chainable = {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(returnValue),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
  };

  return {
    find: jest.fn().mockReturnValue(chainable),
    findOne: jest.fn().mockReturnValue(chainable),
    findById: jest.fn().mockReturnValue(chainable),
    findByIdAndUpdate: jest.fn().mockResolvedValue(returnValue),
    findOneAndUpdate: jest.fn().mockResolvedValue(returnValue),
    create: jest.fn().mockResolvedValue(returnValue),
    updateOne: jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    updateMany: jest.fn().mockResolvedValue({ matchedCount: 0, modifiedCount: 0 }),
    deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
    collection: { dropIndex: jest.fn().mockResolvedValue(undefined) },
    new: jest.fn(),
  } as any;
}

// ──────────────────────────────────────────────────────────
//  JWT SERVICE MOCK
// ──────────────────────────────────────────────────────────

export function createMockJwtService() {
  return {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
    verify: jest.fn().mockReturnValue(createMockUserPayload()),
    decode: jest.fn().mockReturnValue(createMockUserPayload()),
  };
}

// ──────────────────────────────────────────────────────────
//  CONFIG SERVICE MOCK
// ──────────────────────────────────────────────────────────

export function createMockConfigService(overrides: Record<string, any> = {}) {
  const defaults: Record<string, any> = {
    'jwt.refreshExpiresIn': '7d',
    'jwt.refreshSecret': 'test-refresh-secret',
    'nodeEnv': 'test',
    'security.cookieSameSite': 'lax',
    'keycloak.url': 'http://localhost:8080',
    'keycloak.realm': 'p2p',
    'invest.baseUnitPrice': 500_000,
    ...overrides,
  };

  return {
    get: jest.fn((key: string) => defaults[key]),
    getOrThrow: jest.fn((key: string) => {
      if (defaults[key] === undefined) throw new Error(`Config key "${key}" not found`);
      return defaults[key];
    }),
  };
}

// ──────────────────────────────────────────────────────────
//  EXPRESS RESPONSE MOCK
// ──────────────────────────────────────────────────────────

export function createMockResponse() {
  const res: any = {
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return res;
}

// ──────────────────────────────────────────────────────────
//  NESTJS EXECUTION CONTEXT MOCK
// ──────────────────────────────────────────────────────────

export function createMockExecutionContext(overrides: {
  user?: any;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  ip?: string;
} = {}) {
  const request = {
    user: overrides.user || createMockUserPayload(),
    method: overrides.method || 'GET',
    url: overrides.url || '/api/test',
    headers: overrides.headers || { 'user-agent': 'jest-test' },
    ip: overrides.ip || '127.0.0.1',
  };

  const response = createMockResponse();

  return {
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(request),
      getResponse: jest.fn().mockReturnValue({ ...response, statusCode: 200 }),
    }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
    getType: jest.fn().mockReturnValue('http'),
    getArgs: jest.fn().mockReturnValue([request, response]),
  };
}

// ──────────────────────────────────────────────────────────
//  CALL HANDLER MOCK (for Interceptors)
// ──────────────────────────────────────────────────────────

import { of, throwError } from 'rxjs';

export function createMockCallHandler(returnValue: any = { success: true }) {
  return {
    handle: jest.fn().mockReturnValue(of(returnValue)),
  };
}

export function createMockCallHandlerWithError(error: Error) {
  return {
    handle: jest.fn().mockReturnValue(throwError(() => error)),
  };
}

// ──────────────────────────────────────────────────────────
//  REFLECTOR MOCK
// ──────────────────────────────────────────────────────────

export function createMockReflector(metadata: Record<string, any> = {}) {
  return {
    getAllAndOverride: jest.fn((key: string) => metadata[key]),
    get: jest.fn((key: string) => metadata[key]),
  };
}

// ──────────────────────────────────────────────────────────
//  FINERACT SERVICE MOCK
// ──────────────────────────────────────────────────────────

export function createMockFineractService() {
  return {
    getSavingsAccountDetails: jest.fn().mockResolvedValue({
      accountNo: '000000001',
      productId: 1,
      productName: 'E-Wallet',
      summary: { accountBalance: 1_000_000 },
      currency: { code: 'VND' },
      status: { value: 'Active' },
    }),
    getSavingsAccounts: jest.fn().mockResolvedValue([]),
    getWalletType: jest.fn().mockReturnValue('e_wallet'),
    getActiveEWalletAccount: jest.fn().mockResolvedValue({ id: 1, accountNo: '000000001', clientId: 100 }),
    findClientByIdentifier: jest.fn().mockResolvedValue(null),
    getSavingsAccountByAccountNumber: jest.fn().mockResolvedValue(null),
    transferFunds: jest.fn().mockResolvedValue({ resourceId: 'txn-123' }),
    getSavingsAccountTransactions: jest.fn().mockResolvedValue({ pageItems: [], totalFilteredRecords: 0 }),
    getLoanProductDetails: jest.fn().mockResolvedValue({}),
  };
}

// ──────────────────────────────────────────────────────────
//  FINERACT LOAN SERVICE MOCK
// ──────────────────────────────────────────────────────────

export function createMockFineractLoanService() {
  return {
    getLoanCharges: jest.fn().mockResolvedValue([]),
    addLoanCharge: jest.fn().mockResolvedValue({}),
    getChargeDetails: jest.fn().mockResolvedValue(null),
  };
}

// ──────────────────────────────────────────────────────────
//  FABRIC SERVICE MOCK
// ──────────────────────────────────────────────────────────

export function createMockFabricService() {
  return {
    isConnected: jest.fn().mockReturnValue(false),
    submitTransaction: jest.fn().mockResolvedValue(''),
  };
}

// ──────────────────────────────────────────────────────────
//  KEYCLOAK SERVICE MOCK
// ──────────────────────────────────────────────────────────

export function createMockKeycloakService() {
  return {
    getAdminToken: jest.fn().mockResolvedValue('admin-token'),
  };
}

// ──────────────────────────────────────────────────────────
//  MONGOOSE CONNECTION MOCK
// ──────────────────────────────────────────────────────────

export function createMockMongooseConnection(readyState = 1) {
  return {
    readyState,
  };
}

// ──────────────────────────────────────────────────────────
//  SMART OTP SERVICES MOCK
// ──────────────────────────────────────────────────────────

export function createMockOtpSessionService() {
  return {
    createSession: jest.fn().mockResolvedValue({ sessionId: 'session-123', expiresIn: 300 }),
    consumeSession: jest.fn().mockResolvedValue({ valid: true, actionData: {} }),
  };
}

export function createMockSmartOtpService() {
  return {
    verifySmartOtp: jest.fn().mockResolvedValue({ valid: true }),
  };
}

// ──────────────────────────────────────────────────────────
//  MODULE REF MOCK
// ──────────────────────────────────────────────────────────

export function createMockModuleRef() {
  return {
    get: jest.fn().mockReturnValue(null),
  };
}

// ──────────────────────────────────────────────────────────
//  TEST DATA FACTORIES
// ──────────────────────────────────────────────────────────

export function createMockUserPayload(overrides: Partial<{
  _id: string;
  email: string;
  name: string;
  username: string;
  roles: string[];
  keycloakUserId: string;
  fineractClientId: string;
}> = {}) {
  return {
    _id: 'user-id-123',
    email: 'test@example.com',
    name: 'Test User',
    username: '0999000001',
    roles: ['borrower'],
    keycloakUserId: 'kc-user-123',
    fineractClientId: '100',
    ...overrides,
  };
}

export function createMockLoanData(overrides: Partial<{
  loanId: string;
  capital: number;
  rate: number;
  periodMonth: number;
  purpose: string;
  existingNodeMatch: number;
  existingInvestedNotes: number;
}> = {}) {
  return {
    loanId: 'loan-id-123',
    capital: 5_000_000,
    rate: 12,
    periodMonth: 6,
    purpose: 'Kinh doanh nhỏ lẻ',
    existingNodeMatch: 0,
    existingInvestedNotes: 0,
    ...overrides,
  };
}

export function createMockInvestmentOrder(overrides: any = {}) {
  return {
    _id: 'order-id-123',
    totalNodes: 10,
    matchedNodes: 0,
    matchedCapital: 0,
    status: 'open',
    interestRange: { min: 8, max: 20 },
    periodRange: { min: 3, max: 12 },
    purpose: ['Kinh doanh'],
    maxCapital: null,
    loans: [],
    createdAt: new Date(),
    ...overrides,
  };
}

export function createMockActivityLog(overrides: any = {}) {
  return {
    _id: 'log-id-123',
    userId: 'user-id-123',
    action: 'LOGIN',
    details: 'User logged in',
    createdAt: new Date(),
    ...overrides,
  };
}
