/**
 * Mock for otplib — avoids deep ESM dependency chain (@otplib → @scure → @noble)
 * that Jest cannot transform.
 */
export const authenticator = {
  generateSecret: jest.fn().mockReturnValue('MOCK_SECRET_BASE32'),
  generate: jest.fn().mockReturnValue('123456'),
  check: jest.fn().mockReturnValue(true),
  verify: jest.fn().mockReturnValue(true),
  options: {},
  allOptions: jest.fn().mockReturnValue({}),
};

export const totp = {
  generate: jest.fn().mockReturnValue('123456'),
  check: jest.fn().mockReturnValue(true),
  verify: jest.fn().mockReturnValue(true),
  options: {},
};

export function generateSecret(): string {
  return 'MOCK_SECRET_BASE32';
}

export function generateSync(secret: string): string {
  return '123456';
}
