import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class PushNotificationService {
    private readonly logger = new Logger(PushNotificationService.name);
    private readonly EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

    /**
     * Send a push notification to a specific Expo push token
     */
    async sendPushNotification(pushToken: string, title: string, body: string, data: any = {}) {
        if (!pushToken || !pushToken.startsWith('ExponentPushToken')) {
            this.logger.warn(`Invalid push token: ${pushToken}`);
            return;
        }

        try {
            const response = await axios.post(
                this.EXPO_PUSH_URL,
                {
                    to: pushToken,
                    sound: 'default',
                    title,
                    body,
                    data,
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Accept-encoding': 'gzip, deflate',
                    },
                },
            );

            this.logger.log(`Push notification sent successfully to ${pushToken}`);
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to send push notification: ${error.message}`);
            if (error.response) {
                this.logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
            }
        }
    }

    /**
     * Send push notifications to multiple tokens in batch
     */
    async sendBatchPushNotifications(notifications: { to: string; title: string; body: string; data?: any }[]) {
        const validNotifications = notifications.filter(n => n.to && n.to.startsWith('ExponentPushToken'));

        if (validNotifications.length === 0) return;

        try {
            const response = await axios.post(
                this.EXPO_PUSH_URL,
                validNotifications.map(n => ({
                    ...n,
                    sound: 'default',
                })),
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Accept-encoding': 'gzip, deflate',
                    },
                },
            );

            this.logger.log(`Batch push notifications sent. Count: ${validNotifications.length}`);
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to send batch push notifications: ${error.message}`);
        }
    }
}
