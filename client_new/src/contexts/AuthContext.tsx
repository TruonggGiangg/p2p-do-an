import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { authStorage, authEvents, AuthEvent } from '../core';
import { authAPI } from '../features/auth/api/auth.api';
import type { User, LoginRequest, RegisterRequest } from '../types/auth.types';

interface AuthContextData {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (credentials: LoginRequest) => Promise<void>;
    register: (data: RegisterRequest) => Promise<void>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Check authentication status on mount
    useEffect(() => {
        loadStoredAuthData();
    }, []);

    // Listen to auth events
    useEffect(() => {
        authEvents.onSessionExpired(handleSessionExpired);
        authEvents.onLogout(handleLogout);

        return () => {
            authEvents.removeListener(AuthEvent.SESSION_EXPIRED, handleSessionExpired);
            authEvents.removeListener(AuthEvent.LOGOUT, handleLogout);
        };
    }, []);

    const loadStoredAuthData = async () => {
        try {
            const authData = await authStorage.getAuthData();

            if (authData && authData.accessToken) {
                // Set user from storage immediately for faster UI
                setUser(authData.user);

                // Verify token is still valid by fetching current user
                try {
                    const currentUser = await authAPI.getMe();
                    setUser(currentUser);
                } catch {
                    if (__DEV__) {
                        console.log('Stored token invalid, clearing auth data');
                    }
                    await authStorage.clearAll();
                    setUser(null);
                }
            }
        } catch (error) {
            console.error('Failed to load auth data:', error);
            await authStorage.clearAll();
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSessionExpired = async () => {
        if (__DEV__) {
            console.log('Session expired - clearing user');
        }
        await authStorage.clearAll();
        setUser(null);
    };

    const handleLogout = () => {
        if (__DEV__) {
            console.log('Logged out - clearing user');
        }
        setUser(null);
    };

    const login = async (credentials: LoginRequest) => {
        setIsLoading(true);
        try {
            const userData = await authAPI.login(credentials);
            setUser(userData);
        } catch (error: unknown) {
            console.error('Login failed:', error);
            const err = error as { response?: { data?: { message?: string } } };
            throw new Error(err.response?.data?.message || 'Đăng nhập thất bại');
        } finally {
            setIsLoading(false);
        }
    };

    const register = async (data: RegisterRequest) => {
        setIsLoading(true);
        try {
            await authAPI.register(data);
        } catch (error: unknown) {
            console.error('Registration failed:', error);
            const err = error as { response?: { data?: { message?: string } } };
            throw new Error(err.response?.data?.message || 'Đăng ký thất bại');
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        setIsLoading(true);
        try {
            await authAPI.logout();
            await authStorage.clearAll();
            setUser(null);
        } catch {
            // Clear local data even if API call fails
            await authStorage.clearAll();
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    };

    const refreshUser = async () => {
        try {
            const userData = await authAPI.getMe();
            setUser(userData);
        } catch (error: unknown) {
            console.error('Failed to refresh user:', error);
            const err = error as { response?: { status?: number } };
            if (err.response?.status === 401) {
                await authStorage.clearAll();
                setUser(null);
            }
            throw error;
        }
    };

    const value: AuthContextData = {
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshUser,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextData => {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }

    return context;
};
