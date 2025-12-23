/**
 * Auth Events - Event emitter for authentication state changes
 * 
 * Pattern: Event Emitter / Observer Pattern
 * - Cho phép các component lắng nghe khi session bị expire
 * - Giúp httpClient thông báo cho AuthContext reset user state
 */

type AuthEventType = 'SESSION_EXPIRED' | 'TOKEN_REFRESHED';
type AuthEventCallback = () => void;

class AuthEventEmitter {
    private listeners: Map<AuthEventType, Set<AuthEventCallback>> = new Map();

    /**
     * Subscribe to an auth event
     */
    on(event: AuthEventType, callback: AuthEventCallback): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback);

        // Return unsubscribe function
        return () => {
            this.listeners.get(event)?.delete(callback);
        };
    }

    /**
     * Emit an auth event to all listeners
     */
    emit(event: AuthEventType): void {
        console.log(`[AuthEvents] Emitting: ${event}`);
        this.listeners.get(event)?.forEach(callback => {
            try {
                callback();
            } catch (error) {
                console.error(`[AuthEvents] Error in ${event} listener:`, error);
            }
        });
    }
}

// Singleton instance
export const authEvents = new AuthEventEmitter();
export default authEvents;
