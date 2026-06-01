const fs = require('fs');
const path = require('path');

const filesToPatch = [
  {
    path: 'node_modules/expo-notifications/build/NotificationPermissions.types.js',
    content: `// PATCHED for Hermes ESM strict mode compatibility
var _IosAlertStyle = {};
(function (IosAlertStyle) {
    IosAlertStyle[IosAlertStyle["NONE"] = 0] = "NONE";
    IosAlertStyle[IosAlertStyle["BANNER"] = 1] = "BANNER";
    IosAlertStyle[IosAlertStyle["ALERT"] = 2] = "ALERT";
})(_IosAlertStyle);

var _IosAllowsPreviews = {};
(function (IosAllowsPreviews) {
    IosAllowsPreviews[IosAllowsPreviews["NEVER"] = 0] = "NEVER";
    IosAllowsPreviews[IosAllowsPreviews["ALWAYS"] = 1] = "ALWAYS";
    IosAllowsPreviews[IosAllowsPreviews["WHEN_AUTHENTICATED"] = 2] = "WHEN_AUTHENTICATED";
})(_IosAllowsPreviews);

var _IosAuthorizationStatus = {};
(function (IosAuthorizationStatus) {
    IosAuthorizationStatus[IosAuthorizationStatus["NOT_DETERMINED"] = 0] = "NOT_DETERMINED";
    IosAuthorizationStatus[IosAuthorizationStatus["DENIED"] = 1] = "DENIED";
    IosAuthorizationStatus[IosAuthorizationStatus["AUTHORIZED"] = 2] = "AUTHORIZED";
    IosAuthorizationStatus[IosAuthorizationStatus["PROVISIONAL"] = 3] = "PROVISIONAL";
    IosAuthorizationStatus[IosAuthorizationStatus["EPHEMERAL"] = 4] = "EPHEMERAL";
})(_IosAuthorizationStatus);

export {
    _IosAlertStyle as IosAlertStyle,
    _IosAllowsPreviews as IosAllowsPreviews,
    _IosAuthorizationStatus as IosAuthorizationStatus
};
//# sourceMappingURL=NotificationPermissions.types.js.map`
  },
  {
    path: 'node_modules/expo-notifications/build/NotificationChannelManager.types.js',
    content: `// PATCHED for Hermes ESM strict mode compatibility
var _AndroidNotificationVisibility = {};
(function (AndroidNotificationVisibility) {
    AndroidNotificationVisibility[AndroidNotificationVisibility["UNKNOWN"] = 0] = "UNKNOWN";
    AndroidNotificationVisibility[AndroidNotificationVisibility["PUBLIC"] = 1] = "PUBLIC";
    AndroidNotificationVisibility[AndroidNotificationVisibility["PRIVATE"] = 2] = "PRIVATE";
    AndroidNotificationVisibility[AndroidNotificationVisibility["SECRET"] = 3] = "SECRET";
})(_AndroidNotificationVisibility);

var _AndroidAudioContentType = {};
(function (AndroidAudioContentType) {
    AndroidAudioContentType[AndroidAudioContentType["UNKNOWN"] = 0] = "UNKNOWN";
    AndroidAudioContentType[AndroidAudioContentType["SPEECH"] = 1] = "SPEECH";
    AndroidAudioContentType[AndroidAudioContentType["MUSIC"] = 2] = "MUSIC";
    AndroidAudioContentType[AndroidAudioContentType["MOVIE"] = 3] = "MOVIE";
    AndroidAudioContentType[AndroidAudioContentType["SONIFICATION"] = 4] = "SONIFICATION";
})(_AndroidAudioContentType);

var _AndroidImportance = {};
(function (AndroidImportance) {
    AndroidImportance[AndroidImportance["UNKNOWN"] = 0] = "UNKNOWN";
    AndroidImportance[AndroidImportance["UNSPECIFIED"] = 1] = "UNSPECIFIED";
    AndroidImportance[AndroidImportance["NONE"] = 2] = "NONE";
    AndroidImportance[AndroidImportance["MIN"] = 3] = "MIN";
    AndroidImportance[AndroidImportance["LOW"] = 4] = "LOW";
    AndroidImportance[AndroidImportance["DEFAULT"] = 5] = "DEFAULT";
    AndroidImportance[AndroidImportance["HIGH"] = 6] = "HIGH";
    AndroidImportance[AndroidImportance["MAX"] = 7] = "MAX";
})(_AndroidImportance);

var _AndroidAudioUsage = {};
(function (AndroidAudioUsage) {
    AndroidAudioUsage[AndroidAudioUsage["UNKNOWN"] = 0] = "UNKNOWN";
    AndroidAudioUsage[AndroidAudioUsage["MEDIA"] = 1] = "MEDIA";
    AndroidAudioUsage[AndroidAudioUsage["VOICE_COMMUNICATION"] = 2] = "VOICE_COMMUNICATION";
    AndroidAudioUsage[AndroidAudioUsage["VOICE_COMMUNICATION_SIGNALLING"] = 3] = "VOICE_COMMUNICATION_SIGNALLING";
    AndroidAudioUsage[AndroidAudioUsage["ALARM"] = 4] = "ALARM";
    AndroidAudioUsage[AndroidAudioUsage["NOTIFICATION"] = 5] = "NOTIFICATION";
    AndroidAudioUsage[AndroidAudioUsage["NOTIFICATION_RINGTONE"] = 6] = "NOTIFICATION_RINGTONE";
    AndroidAudioUsage[AndroidAudioUsage["NOTIFICATION_COMMUNICATION_REQUEST"] = 7] = "NOTIFICATION_COMMUNICATION_REQUEST";
    AndroidAudioUsage[AndroidAudioUsage["NOTIFICATION_COMMUNICATION_INSTANT"] = 8] = "NOTIFICATION_COMMUNICATION_INSTANT";
    AndroidAudioUsage[AndroidAudioUsage["NOTIFICATION_COMMUNICATION_DELAYED"] = 9] = "NOTIFICATION_COMMUNICATION_DELAYED";
    AndroidAudioUsage[AndroidAudioUsage["NOTIFICATION_EVENT"] = 10] = "NOTIFICATION_EVENT";
    AndroidAudioUsage[AndroidAudioUsage["ASSISTANCE_ACCESSIBILITY"] = 11] = "ASSISTANCE_ACCESSIBILITY";
    AndroidAudioUsage[AndroidAudioUsage["ASSISTANCE_NAVIGATION_GUIDANCE"] = 12] = "ASSISTANCE_NAVIGATION_GUIDANCE";
    AndroidAudioUsage[AndroidAudioUsage["ASSISTANCE_SONIFICATION"] = 13] = "ASSISTANCE_SONIFICATION";
    AndroidAudioUsage[AndroidAudioUsage["GAME"] = 14] = "GAME";
})(_AndroidAudioUsage);

export {
    _AndroidNotificationVisibility as AndroidNotificationVisibility,
    _AndroidAudioContentType as AndroidAudioContentType,
    _AndroidImportance as AndroidImportance,
    _AndroidAudioUsage as AndroidAudioUsage
};
//# sourceMappingURL=NotificationChannelManager.types.js.map`
  },
  {
    path: 'node_modules/expo-local-authentication/build/LocalAuthentication.types.js',
    content: `// PATCHED for Hermes ESM strict mode compatibility
import { Platform } from 'expo-modules-core';

var _AuthenticationType = {};
(function (AuthenticationType) {
    AuthenticationType[AuthenticationType["FINGERPRINT"] = 1] = "FINGERPRINT";
    AuthenticationType[AuthenticationType["FACIAL_RECOGNITION"] = 2] = "FACIAL_RECOGNITION";
    AuthenticationType[AuthenticationType["IRIS"] = 3] = "IRIS";
})(_AuthenticationType);

var _SecurityLevel = {};
(function (SecurityLevel) {
    SecurityLevel[SecurityLevel["NONE"] = 0] = "NONE";
    SecurityLevel[SecurityLevel["SECRET"] = 1] = "SECRET";
    SecurityLevel[SecurityLevel["BIOMETRIC"] = Platform.OS === 'android'
        ? _SecurityLevel.BIOMETRIC_WEAK
        : _SecurityLevel.BIOMETRIC_STRONG] = "BIOMETRIC";
    SecurityLevel[SecurityLevel["BIOMETRIC_WEAK"] = 2] = "BIOMETRIC_WEAK";
    SecurityLevel[SecurityLevel["BIOMETRIC_STRONG"] = 3] = "BIOMETRIC_STRONG";
})(_SecurityLevel);

Object.defineProperty(_SecurityLevel, 'BIOMETRIC', {
    get() {
        const additionalMessage = Platform.OS === 'android'
            ? '. \`SecurityLevel.BIOMETRIC\` is currently an alias for \`SecurityLevel.BIOMETRIC_WEAK\` on Android, which might lead to unexpected behaviour.'
            : '';
        console.warn('\`SecurityLevel.BIOMETRIC\` has been deprecated. Use \`SecurityLevel.BIOMETRIC_WEAK\` or \`SecurityLevel.BIOMETRIC_STRONG\` instead' +
            additionalMessage);
        return Platform.OS === 'android'
            ? _SecurityLevel.BIOMETRIC_WEAK
            : _SecurityLevel.BIOMETRIC_STRONG;
    },
});

export {
    _AuthenticationType as AuthenticationType,
    _SecurityLevel as SecurityLevel
};
//# sourceMappingURL=LocalAuthentication.types.js.map`
  }
];

filesToPatch.forEach(file => {
  const fullPath = path.join(__dirname, file.path);
  if (fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, file.content, 'utf8');
    console.log(`Successfully patched: ${file.path}`);
  } else {
    console.warn(`File not found for patching: ${file.path}`);
  }
});

// Extra dynamic patch for react-native built-in Event class fields which crash Hermes
const rnEventPath = path.join(__dirname, 'node_modules/react-native/src/private/webapis/dom/events/Event.js');
if (fs.existsSync(rnEventPath)) {
  let content = fs.readFileSync(rnEventPath, 'utf8');
  if (content.includes('static +NONE: 0;')) {
    content = content.replace(
      /static \+NONE: 0;[\s\S]*?\+BUBBLING_PHASE: 3;/,
      `// static +NONE: 0;
  // static +CAPTURING_PHASE: 1;
  // static +AT_TARGET: 2;
  // static +BUBBLING_PHASE: 3;

  // +NONE: 0;
  // +CAPTURING_PHASE: 1;
  // +AT_TARGET: 2;
  // // +BUBBLING_PHASE: 3;`
    );
    fs.writeFileSync(rnEventPath, content, 'utf8');
    console.log('Successfully patched: react-native Event.js');
  }
}
