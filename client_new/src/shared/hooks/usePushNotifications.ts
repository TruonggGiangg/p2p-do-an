import { useState, useEffect, useRef } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { loanService } from '../../features/loan/services/loan.service';

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export const usePushNotifications = (userId?: string) => {
    const [expoPushToken, setExpoPushToken] = useState<string | undefined>();
    const [notification, setNotification] = useState<Notifications.Notification | undefined>();
    const notificationListener = useRef<Notifications.EventSubscription>(undefined);
    const responseListener = useRef<Notifications.EventSubscription>(undefined);

    async function registerForPushNotificationsAsync() {
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
        if (userId) {
            registerForPushNotificationsAsync().then(token => {
                if (token) {
                    setExpoPushToken(token);
                    loanService.updatePushToken(token).catch(err => {
                        console.error('Failed to update push token on server:', err);
                    });
                }
            });
        }

        notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
            setNotification(notification);
        });

        responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
            console.log('Notification Tapped:', response);
        });

        return () => {
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
