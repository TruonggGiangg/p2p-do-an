/**
 * Auth Context - Quản lý authentication state
 * 
 * Pattern: Context + Provider Pattern
 * - Centralized auth state management
 * - Sử dụng các services đã tách biệt
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { authApi, keycloakApi, storageService } from '../services';

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (username: string, password: string) => Promise<void>;
    register: (username: string, password: string, email: string, firstName: string, lastName: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        checkAuthStatus();
    }, []);

    /**
     * Check if user has valid session on app start
     */
    const checkAuthStatus = async (): Promise<void> => {
        try {
            const savedUser = await storageService.getUser();
            const token = await storageService.getAccessToken();

            if (savedUser && token) {
                setUser(savedUser);
            }
        } catch (error) {
            console.error('[AuthContext] Check auth error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Login flow:
     * 1. Get Keycloak token
     * 2. Login to NestJS server
     * 3. Save Keycloak token (for API calls) and user data
     */
    const login = async (username: string, password: string): Promise<void> => {
        setIsLoading(true);
        try {
            // Step 1: Authenticate with Keycloak
            const keycloakResponse = await keycloakApi.login(username, password);

            // Step 2: Login to our server with Keycloak token (to sync user data)
            const loginResponse = await authApi.login(keycloakResponse.access_token);

            // Step 3: Save KEYCLOAK tokens (server validates RS256 tokens with 'kid')
            await storageService.saveTokens(
                keycloakResponse.access_token,
                keycloakResponse.refresh_token
            );
            await storageService.saveUser(loginResponse.data);

            setUser(loginResponse.data);
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Register new user via backend (Fineract + Keycloak)
     */
    const register = async (
        username: string,
        password: string,
        email: string,
        firstName: string,
        lastName: string,
        userType?: 'borrower' | 'lender'
    ): Promise<void> => {
        setIsLoading(true);
        try {
            await authApi.register({
                phoneNumber: username,
                password,
                email,
                firstName,
                lastName,
                userType: userType || 'borrower',
            });
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Logout and clear session
     */
    const logout = async (): Promise<void> => {
        setIsLoading(true);
        try {
            await authApi.logout();
        } catch (error) {
            console.error('[AuthContext] Logout error:', error);
        } finally {
            await storageService.clearAll();
            setUser(null);
            setIsLoading(false);
        }
    };

    /**
     * Refresh access token
     */
    const refreshToken = async (): Promise<void> => {
        try {
            const response = await authApi.refreshToken();
            if (response.data?.accessToken) {
                await storageService.saveAccessToken(response.data.accessToken);
            }
        } catch (error) {
            console.error('[AuthContext] Refresh token error:', error);
            throw error;
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                isLoading,
                isAuthenticated: !!user,
                login,
                register,
                logout,
                refreshToken,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

/**
 * Custom hook to use auth context
 */
export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};
