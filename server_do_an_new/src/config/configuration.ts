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
        creditWalletProductId: parseInt(process.env.DEFAULT_CREDIT_WALLET_PRODUCT_ID || '1', 10),
        ewalletProductId: parseInt(process.env.DEFAULT_EWALLET_PRODUCT_ID || '3', 10),
        emailDomain: process.env.DEFAULT_EMAIL_DOMAIN || 'p2p.com',

        bnplLoanProductId: parseInt(process.env.DEFAULT_BNPL_LOAN_PRODUCT_ID || '4', 10),
        bnplCreditLimit: parseInt(process.env.DEFAULT_BNPL_CREDIT_LIMIT || '5000000', 10),
    },

    // BNPL Pay Later Wallet Configuration
    bnpl: {
        loanProductId: parseInt(process.env.DEFAULT_BNPL_LOAN_PRODUCT_ID || '1', 10),
        creditLimit: parseInt(process.env.DEFAULT_BNPL_CREDIT_LIMIT || '5000000', 10),
        defaultRepayments: 3,
        interestRatePerMonth: 1.5,
    },


    security: {
        corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['*'],
        cookieSecure: process.env.COOKIE_SECURE === 'true',
        cookieSameSite: (process.env.COOKIE_SAME_SITE || 'lax') as 'strict' | 'lax' | 'none',
        rateLimitTtl: parseInt(process.env.RATE_LIMIT_TTL || '60000', 10),
        rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    },
});
