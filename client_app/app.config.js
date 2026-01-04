import 'dotenv/config';

export default {
    expo: {
        name: "client_app",
        slug: "client_app",
        version: "1.0.0",
        orientation: "portrait",
        icon: "./assets/icon.png",
        userInterfaceStyle: "light",
        splash: {
            image: "./assets/splash-icon.png",
            resizeMode: "contain",
            backgroundColor: "#ffffff"
        },
        ios: {
            supportsTablet: true
        },
        android: {
            adaptiveIcon: {
                foregroundImage: "./assets/adaptive-icon.png",
                backgroundColor: "#ffffff"
            },
            edgeToEdgeEnabled: true,
            predictiveBackGestureEnabled: false
        },
        web: {
            favicon: "./assets/favicon.png"
        },
        plugins: [
            "expo-secure-store",
            "@react-native-community/datetimepicker",
            "expo-font"
        ],
        // Pass environment variables to the app
        extra: {
            API_BASE_URL: process.env.API_BASE_URL || "http://192.168.1.56:3000",
            KEYCLOAK_BASE_URL: process.env.KEYCLOAK_BASE_URL || "http://118.69.41.95:9000",
            KEYCLOAK_REALM: process.env.KEYCLOAK_REALM || "fineract",
            KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID || "community-app",
            KEYCLOAK_ADMIN_USERNAME: process.env.KEYCLOAK_ADMIN_USERNAME || "admin",
            KEYCLOAK_ADMIN_PASSWORD: process.env.KEYCLOAK_ADMIN_PASSWORD || "admin",
            EKYC_SERVICE_URL: process.env.EKYC_SERVICE_URL || "http://192.168.1.36:8000",
        }
    }
};
