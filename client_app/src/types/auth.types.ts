/**
 * Auth Types - Định nghĩa các types liên quan đến Authentication
 */

import { User } from './user.types';

// Keycloak Token Response từ /token endpoint
export interface KeycloakTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    refresh_expires_in: number;
    token_type: string;
    scope: string;
}

// Keycloak Token Payload (decoded JWT)
export interface KeycloakTokenPayload {
    sub: string;
    preferred_username: string;
    email?: string;
    name?: string;
    given_name?: string;
    family_name?: string;
    realm_access?: {
        roles: string[];
    };
    fineractClientId?: string;
    iat: number;
    exp: number;
}

// Login Response từ NestJS server
export interface LoginResponse {
    statusCode: number;
    message: string;
    data: User;
    accessToken: string;
    refreshToken: string;
}

// Auth Me Response
export interface AuthMeResponse {
    data: User;
}

// User Info Response (with Keycloak details)
export interface UserInfoResponse {
    data: User & {
        keycloakDetails?: KeycloakUserDetails;
    };
}

// Keycloak User Details từ Admin API
export interface KeycloakUserDetails {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    emailVerified: boolean;
    enabled: boolean;
    createdTimestamp?: number;
}

// Login Credentials
export interface LoginCredentials {
    username: string;
    password: string;
}

// Register Data
export interface RegisterData {
    username: string;
    password: string;
    email: string;
    firstName: string;
    lastName: string;
}

// Refresh Token Response
export interface RefreshTokenResponse {
    data: {
        accessToken: string;
        _id: string;
        email?: string;
        name?: string;
        roles?: string[];
    };
}
