import type { User } from '../../../types/auth.types';

/**
 * Get user display name with fallback priority:
 * 1. user.name
 * 2. firstName + lastName
 * 3. username
 * 4. 'Người dùng'
 */
export const getUserDisplayName = (user: User | null): string => {
    if (!user) return 'Người dùng';
    
    // Priority: name > firstName + lastName > username
    if (user.name) return user.name;
    
    const fullName = `${user.profile?.firstName || ''} ${user.profile?.lastName || ''}`.trim();
    if (fullName) return fullName;
    
    return user.username || 'Người dùng';
};

/**
 * Get user initials with fallback priority:
 * 1. firstName[0]
 * 2. name[0]
 * 3. username[0]
 * 4. '?'
 */
export const getUserInitials = (user: User | null): string => {
    if (!user) return '?';
    
    // Priority: firstName > name > username
    if (user.profile?.firstName?.[0]) return user.profile.firstName[0].toUpperCase();
    
    if (user.name?.[0]) return user.name[0].toUpperCase();
    
    if (user.username?.[0]) return user.username[0].toUpperCase();
    
    return '?';
};

/**
 * Get user email if available
 */
export const getUserEmail = (user: User | null): string | null => {
    return user?.email || null;
};

/**
 * Get user phone number from metadata if available
 */
export const getUserPhone = (user: User | null): string | null => {
    return user?.metadata?.phone || null;
};
