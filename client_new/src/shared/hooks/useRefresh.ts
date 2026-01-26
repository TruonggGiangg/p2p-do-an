import { useState, useCallback } from 'react';

/**
 * Hook for pull-to-refresh functionality
 */
export function useRefresh(onRefresh: () => Promise<void>) {
    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await onRefresh();
        } finally {
            setRefreshing(false);
        }
    }, [onRefresh]);

    return { refreshing, onRefresh: handleRefresh };
}
