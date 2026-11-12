import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Configure how incoming notifications are presented when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Registers device for remote push notifications and returns Expo Push Token.
 * Supports iOS, Android, and Web / PWA environments.
 */
export async function registerForPushNotificationsAsync() {
  let token = null;

  // 1. Android Notification Channel (MAX priority for Lock Screen & Heads-Up alerts)
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4A7C59',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
      console.log('[Push] Android default high-priority notification channel configured.');
    } catch (channelErr) {
      console.warn('[Push] Failed to set Android notification channel:', channelErr.message);
    }
  }

  // Safely extract EAS project ID from Expo config or fallback to registered EAS project ID
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId ??
    '45c6f071-23ad-4887-8e0b-2c975198c3ae';

  // 2. Web / PWA Registration
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return null;
    }

    const hasPushSupport =
      'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

    if (!hasPushSupport) {
      console.log('[Push] Browser does not support Web Push / PushManager.');
      return null;
    }

    try {
      const permission = await Notification.requestPermission();
      console.log(`[Push] Web Notification permission: ${permission}`);

      if (permission !== 'granted') {
        console.warn('[Push] Web notification permission denied by user.');
        return null;
      }

      // Attempt to retrieve token via Expo Notifications for web if service worker is active
      try {
        const pushTokenData = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : {}
        );
        token = pushTokenData?.data || null;
        if (token) {
          console.log('[Push] Web Expo Push Token generated:', token.substring(0, 25) + '...');
        }
      } catch (webTokenErr) {
        console.log('[Push] Expo web push token skipped (VAPID key or custom SW required):', webTokenErr.message);
      }
    } catch (e) {
      console.warn('[Push] Error requesting web notification permission:', e.message);
    }

    return token;
  }

  // 3. Native Device Registration (iOS & Android)
  if (!Device.isDevice) {
    console.warn('[Push] Remote push notifications require a physical device. Simulator/Emulator detected.');
    return null;
  }

  // Check & request runtime permissions (including Android 13+ POST_NOTIFICATIONS)
  let finalStatus = 'undetermined';
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }
  } catch (permErr) {
    console.warn('[Push] Permission check/request error:', permErr.message);
  }

  console.log(`[Push] Device: ${Device.modelName || Platform.OS}, Permission: ${finalStatus}`);

  if (finalStatus !== 'granted') {
    console.warn(`[Push] Push notification permission not granted (status: ${finalStatus}).`);
    return null;
  }

  // Retrieve the Expo Push Token using project ID
  try {
    const pushTokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    token = pushTokenData?.data || null;
    if (token) {
      console.log('[Push] Device Expo Push Token acquired:', token.substring(0, 25) + '...');
    }
  } catch (error) {
    console.error('[Push] Failed to get Expo push token:', error);
  }

  return token;
}
