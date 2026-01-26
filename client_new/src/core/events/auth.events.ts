import EventEmitter from 'eventemitter3';

export enum AuthEvent {
    SESSION_EXPIRED = 'SESSION_EXPIRED',
    TOKEN_REFRESHED = 'TOKEN_REFRESHED',
    LOGOUT = 'LOGOUT',
    LOGIN = 'LOGIN',
    AUTH_ERROR = 'AUTH_ERROR',
}

class AuthEventEmitter extends EventEmitter {
    emitSessionExpired(): void {
        this.emit(AuthEvent.SESSION_EXPIRED);
    }

    emitTokenRefreshed(accessToken: string): void {
        this.emit(AuthEvent.TOKEN_REFRESHED, accessToken);
    }

    emitLogout(): void {
        this.emit(AuthEvent.LOGOUT);
    }

    emitLogin(): void {
        this.emit(AuthEvent.LOGIN);
    }

    emitAuthError(error: Error): void {
        this.emit(AuthEvent.AUTH_ERROR, error);
    }

    onSessionExpired(callback: () => void): () => void {
        this.on(AuthEvent.SESSION_EXPIRED, callback);
        return () => this.off(AuthEvent.SESSION_EXPIRED, callback);
    }

    onTokenRefreshed(callback: (token: string) => void): () => void {
        this.on(AuthEvent.TOKEN_REFRESHED, callback);
        return () => this.off(AuthEvent.TOKEN_REFRESHED, callback);
    }

    onLogout(callback: () => void): () => void {
        this.on(AuthEvent.LOGOUT, callback);
        return () => this.off(AuthEvent.LOGOUT, callback);
    }

    onLogin(callback: () => void): () => void {
        this.on(AuthEvent.LOGIN, callback);
        return () => this.off(AuthEvent.LOGIN, callback);
    }

    onAuthError(callback: (error: Error) => void): () => void {
        this.on(AuthEvent.AUTH_ERROR, callback);
        return () => this.off(AuthEvent.AUTH_ERROR, callback);
    }
}

export const authEvents = new AuthEventEmitter();
