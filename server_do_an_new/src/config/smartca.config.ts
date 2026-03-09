import { registerAs } from '@nestjs/config';

export default registerAs('smartCA', () => ({
  // VNPT SmartCA API base URL
  // Test: https://rmgateway.vnptit.vn  |  Prod: https://gwsca.vnpt.vn
  apiUrl: process.env.SMARTCA_API_URL || 'https://rmgateway.vnptit.vn',

  // sp_id & sp_password (cặp credentials xác định service partner)
  spId: process.env.SMARTCA_SP_ID || '',
  spPassword: process.env.SMARTCA_SP_PASSWORD || '',

  // Default user_id (CCCD) - for testing; in production taken from user's KYC
  defaultUserId: process.env.SMARTCA_DEFAULT_USER_ID || '',

  // API paths
  certPath: process.env.SMARTCA_CERT_PATH || '/sca/sp769/v1/credentials/get_certificate',
  signV1Path: process.env.SMARTCA_SIGN_V1_PATH || '/sca/sp769/v1/signatures/sign',
  signV2Path: process.env.SMARTCA_SIGN_V2_PATH || '/sca/sp769/v2/signatures/sign',
  confirmV2Path: process.env.SMARTCA_CONFIRM_V2_PATH || '/sca/sp769/v2/signatures/confirm',
  statusPathTmpl: process.env.SMARTCA_STATUS_PATH_TMPL || '/sca/sp769/v1/signatures/sign/{transactionId}/status',

  // Timeouts
  signingTimeoutMs: parseInt(process.env.SMARTCA_SIGNING_TIMEOUT_MS || '300000', 10),
  pollingIntervalMs: parseInt(process.env.SMARTCA_POLLING_INTERVAL_MS || '3000', 10),
}));
