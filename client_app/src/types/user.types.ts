/**
 * User Types - Định nghĩa các types liên quan đến User
 */

export interface User {
    _id: string;
    keycloakUserId: string;
    username: string;
    email?: string;
    name?: string;
    roles?: string[];
    fineractClientId?: string;
}

export interface UserProfile extends User {
    firstName?: string;
    lastName?: string;
    emailVerified?: boolean;
    enabled?: boolean;
    createdTimestamp?: number;
}
