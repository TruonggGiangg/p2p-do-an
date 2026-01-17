export interface User {
    _id?: string;
    username: string;
    email?: string;
    name?: string;
    roles?: string[];
    keycloakUserId?: string;
    fineractClientId?: string | number;
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}

export interface LoginRequest {
    username: string;
    password: string;
}

export interface RegisterRequest {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email?: string;
    password: string;
    userType?: 'borrower' | 'lender';
}

export interface LoginResponse {
    statusCode: number;
    message: string;
    data: User;
    accessToken: string;
    refreshToken: string;
}

export interface RegisterResponse {
    statusCode: number;
    message: string;
    data: {
        username: string;
        clientId: number;
        savingsId: number;
    };
}

export interface RefreshResponse {
    statusCode: number;
    data: {
        accessToken: string;
    } & User;
}
