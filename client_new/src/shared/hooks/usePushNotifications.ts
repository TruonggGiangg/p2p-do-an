import { useState, useEffect, useRef } from 'react';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { loanService } from '../../features/loan/services/loan.service';

export const usePushNotifications = (userId?: string) => {
    const [expoPushToken, setExpoPushToken] = useState<string | undefined>();
    const [notification, setNotification] = useState<any>(undefined);
    const notificationListener = useRef<any>(undefined);
    const responseListener = useRef<any>(undefined);

    async function registerForPushNotificationsAsync(Notifications: any) {
        let token;

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF231F7C',
            });
        }

        if (Device.isDevice) {
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;
            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }
            if (finalStatus !== 'granted') {
                console.warn('Failed to get push token for push notification!');
                return;
            }
            token = (await Notifications.getExpoPushTokenAsync({
                projectId: undefined, // Expo will use the one in app.json if undefined
            })).data;
        } else {
            console.warn('Must use physical device for Push Notifications');
        }

        return token;
    }

    useEffect(() => {
        if (!userId) {
            return;
        }

        let isMounted = true;

        (async () => {
            try {
                const Notifications = await import('expo-notifications');

                Notifications.setNotificationHandler({
                    handleNotification: async () => ({
                        shouldShowAlert: true,
                        shouldPlaySound: true,
                        shouldSetBadge: true,
                        shouldShowBanner: true,
                        shouldShowList: true,
                    }),
                });

                const token = await registerForPushNotificationsAsync(Notifications);
                if (isMounted && token) {
                    setExpoPushToken(token);
                    loanService.updatePushToken(token).catch(err => {
                        console.error('Failed to update push token on server:', err);
                    });
                }

                notificationListener.current = Notifications.addNotificationReceivedListener((incoming: any) => {
                    if (isMounted) {
                        setNotification(incoming);
                    }
                });

                responseListener.current = Notifications.addNotificationResponseReceivedListener((response: any) => {
                    console.log('Notification Tapped:', response);
                });
            } catch (error) {
                console.warn('Push notifications unavailable on this device/session:', error);
            }
        })();

        return () => {
            isMounted = false;
            if (notificationListener.current) {
                (notificationListener.current as any).remove();
            }
            if (responseListener.current) {
                (responseListener.current as any).remove();
            }
        };
    }, [userId]);

    return { expoPushToken, notification };
};
