/**
 * useDigitalFootprint Hook
 * Collects device digital footprint data for credit scoring
 * 
 * Uses: expo-battery, expo-network, expo-location
 * Reference: p2p/client/src/.../LoanCreditAssessment.js
 */

import { useCallback, useState } from 'react';
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';
import * as Location from 'expo-location';

/**
 * Digital footprint data structure
 */
export interface DigitalFootprintData {
    battery_level: number;          // 0-100
    submission_hour: number;        // 0-23
    connection_type: 'wifi' | '4g' | 'unknown';
    location_match: 'true' | 'false';
    device_score: number;           // 0-100 (calculated)
}

/**
 * Hook return type
 */
interface UseDigitalFootprintReturn {
    footprint: DigitalFootprintData | null;
    loading: boolean;
    error: string | null;
    collectFootprint: () => Promise<DigitalFootprintData | null>;
}

/**
 * Calculate device score based on collected data
 */
const calculateDeviceScore = (data: Omit<DigitalFootprintData, 'device_score'>): number => {
    let score = 0;

    // Battery level contribution (max 20 points)
    if (data.battery_level >= 80) score += 20;
    else if (data.battery_level >= 50) score += 15;
    else if (data.battery_level >= 20) score += 10;
    else score += 5;

    // Submission hour contribution (max 25 points)
    // Business hours (8-20) are considered more trustworthy
    const hour = data.submission_hour;
    if (hour >= 8 && hour <= 18) score += 25;
    else if (hour >= 6 && hour <= 22) score += 15;
    else score += 5; // Late night submissions

    // Connection type contribution (max 20 points)
    if (data.connection_type === 'wifi') score += 20;
    else if (data.connection_type === '4g') score += 15;
    else score += 5;

    // Location permission contribution (max 35 points)
    if (data.location_match === 'true') score += 35;
    else score += 10;

    return Math.min(100, score);
};

/**
 * useDigitalFootprint Hook
 * Collects and returns digital footprint data from device
 */
export const useDigitalFootprint = (): UseDigitalFootprintReturn => {
    const [footprint, setFootprint] = useState<DigitalFootprintData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const collectFootprint = useCallback(async (): Promise<DigitalFootprintData | null> => {
        try {
            setLoading(true);
            setError(null);

            // 1. Battery level
            let batteryLevel = 50;
            try {
                const level = await Battery.getBatteryLevelAsync();
                batteryLevel = Math.round(level * 100);
                console.log('[DigitalFootprint] Battery:', batteryLevel);
            } catch (e) {
                console.warn('[DigitalFootprint] Battery error:', e);
            }

            // 2. Connection type
            let connectionType: 'wifi' | '4g' | 'unknown' = 'unknown';
            try {
                const networkState = await Network.getNetworkStateAsync();
                if (networkState.type === Network.NetworkStateType.WIFI) {
                    connectionType = 'wifi';
                } else if (networkState.type === Network.NetworkStateType.CELLULAR) {
                    connectionType = '4g';
                }
                console.log('[DigitalFootprint] Network:', connectionType);
            } catch (e) {
                console.warn('[DigitalFootprint] Network error:', e);
            }

            // 3. Location permission status
            let locationMatch: 'true' | 'false' = 'false';
            try {
                const { status } = await Location.getForegroundPermissionsAsync();
                locationMatch = status === 'granted' ? 'true' : 'false';
                console.log('[DigitalFootprint] Location permission:', locationMatch);
            } catch (e) {
                console.warn('[DigitalFootprint] Location error:', e);
            }

            // 4. Submission hour
            const submissionHour = new Date().getHours();

            // Build partial data for score calculation
            const partialData = {
                battery_level: batteryLevel,
                submission_hour: submissionHour,
                connection_type: connectionType,
                location_match: locationMatch,
            };

            // 5. Calculate device score
            const deviceScore = calculateDeviceScore(partialData);

            const data: DigitalFootprintData = {
                ...partialData,
                device_score: deviceScore,
            };

            console.log('[DigitalFootprint] Complete:', data);
            setFootprint(data);
            return data;

        } catch (err: any) {
            const message = err?.message || 'Không thể thu thập dữ liệu thiết bị';
            console.error('[DigitalFootprint] Error:', message);
            setError(message);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        footprint,
        loading,
        error,
        collectFootprint,
    };
};

export default useDigitalFootprint;
