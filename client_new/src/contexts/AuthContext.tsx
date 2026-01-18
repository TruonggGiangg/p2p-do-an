import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { authApi } from '../services/auth.api';
import { secureStorageService } from '../services/secure-storage.service';
import { authEvents, AuthEvent } from '../services/authEvents';
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
            const authData = await secureStorageService.getAuthData();

            if (authData) {
                setUser(authData.user);
            }
        } catch (error) {
            console.error('Failed to load auth data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSessionExpired = () => {
        console.log('Session expired - clearing user');
        setUser(null);
        // TODO: Navigate to login screen
    };

    const handleLogout = () => {
        console.log('Logged out - clearing user');
        setUser(null);
    };

    const login = async (credentials: LoginRequest) => {
        setIsLoading(true);
        try {
            const userData = await authApi.login(credentials);
            setUser(userData);
        } catch (error: any) {
            console.error('Login failed:', error);
            throw new Error(error.response?.data?.message || 'Đăng nhập thất bại');
        } finally {
            setIsLoading(false);
        }
    };

    const register = async (data: RegisterRequest) => {
        setIsLoading(true);
        try {
            await authApi.register(data);
            // After successful registration, user needs to login
        } catch (error: any) {
            console.error('Registration failed:', error);
            throw new Error(error.response?.data?.message || 'Đăng ký thất bại');
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        setIsLoading(true);
        try {
            await authApi.logout();
            await secureStorageService.clearAll();
            setUser(null);
        } catch (error) {
            console.error('Logout failed:', error);
            // Clear local data even if API call fails
            await secureStorageService.clearAll();
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    };

    const refreshUser = async () => {
        try {
            const userData = await authApi.getMe();
            setUser(userData);
        } catch (error) {
            console.error('Failed to refresh user:', error);
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
