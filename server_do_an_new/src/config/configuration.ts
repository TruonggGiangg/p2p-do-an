export default () => ({
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    uri: process.env.MONGODB_URI,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRE || '1h',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
  },

  keycloak: {
    url: process.env.KEYCLOAK_URL,
    realm: process.env.KEYCLOAK_REALM,
    clientId: process.env.KEYCLOAK_CLIENT_ID,
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
    adminUsername: process.env.KEYCLOAK_ADMIN_USERNAME,
    adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD,
    adminRealm: process.env.KEYCLOAK_ADMIN_REALM || 'master',
    adminClientId: process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'admin-cli',
  },

  fineract: {
    apiUrl: process.env.FINERACT_API_URL,
    tenant: process.env.FINERACT_TENANT,
    username: process.env.FINERACT_USERNAME,
    password: process.env.FINERACT_PASSWORD,
  },

  defaults: {
    officeId: parseInt(process.env.DEFAULT_OFFICE_ID || '1', 10),
    legalFormId: parseInt(process.env.DEFAULT_LEGAL_FORM_ID || '1', 10),
    locale: process.env.DEFAULT_LOCALE || 'en',
    dateFormat: process.env.DEFAULT_DATE_FORMAT || 'dd MMMM yyyy',
    ewalletProductId: parseInt(process.env.DEFAULT_EWALLET_PRODUCT_ID || '1', 10),
    emailDomain: process.env.DEFAULT_EMAIL_DOMAIN || 'p2p.com',
  },

  // BNPL Pay Later Wallet Configuration
  bnpl: {
    loanProductId: parseInt(process.env.BNPL_LOAN_PRODUCT_ID || process.env.DEFAULT_BNPL_LOAN_PRODUCT_ID || '1', 10),
    creditLimit: parseInt(process.env.BNPL_CREDIT_LIMIT || process.env.DEFAULT_BNPL_CREDIT_LIMIT || '5000000', 10),
    defaultRepayments: parseInt(process.env.BNPL_DEFAULT_REPAYMENTS || '3', 10),
    minAmount: parseInt(process.env.BNPL_MIN_AMOUNT || '500000', 10),
    maxAmount: parseInt(process.env.BNPL_MAX_AMOUNT || '50000000', 10),
    maxRepayments: parseInt(process.env.BNPL_MAX_REPAYMENTS || '24', 10),
    currencyMultiples: parseInt(process.env.BNPL_CURRENCY_MULTIPLES || '1000', 10),
  },

  ekyc: {
    serviceUrl: process.env.EKYC_SERVICE_URL || 'http://localhost:8000',
    timeout: parseInt(process.env.EKYC_TIMEOUT || '20000', 10),
    bypassFaceMatch: process.env.EKYC_BYPASS_FACE_MATCH === 'true',
  },

  // AIScore PD (Probability of Default) Service
  // Luồng: XGBoost → PD → Credit Score → Grade/SubGrade → Tier → Decision
  aiscore: {
    serviceUrl: process.env.AISCORE_SERVICE_URL || 'http://localhost:8001',
    timeout: parseInt(process.env.AISCORE_TIMEOUT || '15000', 10),
    enabled: process.env.AISCORE_ENABLED === 'true', // false by default, bật khi cần
  },

  // VNPT SmartCA Digital Signature
  smartca: {
    apiUrl: process.env.SMARTCA_API_URL || 'https://gwsca.vnpt.vn',
    clientId: process.env.SMARTCA_CLIENT_ID || '',
    clientSecret: process.env.SMARTCA_CLIENT_SECRET || '',
    callbackUrl: process.env.SMARTCA_CALLBACK_URL || '',
    signingTimeoutMs: parseInt(process.env.SMARTCA_SIGNING_TIMEOUT_MS || '900000', 10), // 15 minutes
    maxRetries: parseInt(process.env.SMARTCA_MAX_RETRIES || '3', 10),
  },

  security: {
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['*'],
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    cookieSameSite: (process.env.COOKIE_SAME_SITE || 'lax') as 'strict' | 'lax' | 'none',
    rateLimitTtl: parseInt(process.env.RATE_LIMIT_TTL || '60000', 10),
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },
});
