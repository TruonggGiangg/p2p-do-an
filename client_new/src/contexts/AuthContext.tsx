import React, { createContext, useState, useEffect, useContext, ReactNode, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { authStorage, authEvents, AuthEvent } from '../core';
import { authAPI } from '../features/auth/api/auth.api';
import { setSmartOTPUserId, clearSmartOTPUserId, migrateFromLegacyKeys } from '../services/smart-otp.service';
import type { User, LoginRequest, RegisterRequest, LoginResponse } from '../types/auth.types';

interface AuthContextData {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (credentials: LoginRequest) => Promise<LoginResponse>;
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

    // Foreground refresh
    const appState = useRef(AppState.currentState);
    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (
                appState.current.match(/inactive|background/) &&
                nextAppState === 'active'
            ) {
                if (user) {
                    refreshUser().catch(() => {});
                }
            }
            appState.current = nextAppState;
        });

        return () => {
            subscription.remove();
        };
    }, [user]);

    const loadStoredAuthData = async () => {
        try {
            const authData = await authStorage.getAuthData();

            if (authData && authData.accessToken) {
                // Set user from storage immediately for faster UI
                setUser(authData.user);
                // Scope SmartOTP keys to restored user
                const uid = (authData.user as any)?._id || (authData.user as any)?.id;
                if (uid) {
                    setSmartOTPUserId(uid);
                    // Migrate legacy global OTP keys to user-scoped (one-time)
                    migrateFromLegacyKeys().catch(() => {});
                }

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

    const login = async (credentials: LoginRequest): Promise<LoginResponse> => {
        setIsLoading(true);
        try {
            const response = await authAPI.login(credentials);
            if (!response.requires2fa && response.data) {
                setUser(response.data);
                // Scope SmartOTP keys to this user
                const uid = (response.data as any)?._id || (response.data as any)?.id;
                if (uid) setSmartOTPUserId(uid);
            }
            return response;
        } catch (error: unknown) {
            console.error('Login failed:', error);
            const err = error as any;
            const message = err.response?.data?.message || err.message || 'Đăng nhập thất bại';
            throw new Error(message);
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
            const err = error as any;
            const message = err.response?.data?.message || err.message || 'Đăng ký thất bại';
            throw new Error(message);
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        setIsLoading(true);
        try {
            await authAPI.logout();
            await authStorage.clearAll();
            clearSmartOTPUserId();
            setUser(null);
        } catch {
            // Clear local data even if API call fails
            await authStorage.clearAll();
            clearSmartOTPUserId();
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
