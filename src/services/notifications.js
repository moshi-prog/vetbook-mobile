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
 * Utility to convert base64 VAPID public key into a Uint8Array
 * required by navigator.serviceWorker pushManager.subscribe().
 */
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Requests Web Push permissions and generates a standard VAPID Web Push subscription.
 * In iOS Safari 16.4+ (PWA), this MUST be called inside a direct user click/tap gesture.
 *
 * @param {string} vapidPublicKey Base64 URL-safe VAPID public key
 * @returns {Promise<string|null>} Serialized JSON subscription string or null
 */
export async function requestWebPushPermissionAsync(vapidPublicKey) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof navigator === 'undefined') {
    return null;
  }

  const hasPushSupport =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  if (!hasPushSupport) {
    console.warn('[Push] Browser does not support Web Push / PushManager.');
    return null;
  }

  try {
    // 1. Request permission from user (must be initiated by user tap in Safari)
    const permission = await Notification.requestPermission();
    console.log(`[Push] User notification permission result: ${permission}`);

    if (permission !== 'granted') {
      console.warn('[Push] User denied or dismissed notification permission.');
      return null;
    }

    // 2. Wait for active Service Worker registration
    const registration = await navigator.serviceWorker.ready;
    if (!registration || !registration.pushManager) {
      console.warn('[Push] Service worker active registration or pushManager not available.');
      return null;
    }

    // 3. Subscribe or retrieve existing subscription
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      if (!vapidPublicKey) {
        console.warn('[Push] Missing VAPID public key for web push subscription.');
        return null;
      }

      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      });
    }

    if (subscription) {
      const serialized = JSON.stringify(subscription);
      console.log('[Push] Web Push subscription successfully generated.');
      return serialized;
    }
  } catch (err) {
    console.warn('[Push] Error in requestWebPushPermissionAsync:', err?.message || err);
  }

  return null;
}

/**
 * Registers device for remote push notifications and returns the push token/subscription string.
 * Supports native iOS, Android, and Web / PWA environments.
 */
export async function registerForPushNotificationsAsync(vapidPublicKey = null) {
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
    if (typeof window !== 'undefined' && typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') {
        return await requestWebPushPermissionAsync(vapidPublicKey);
      }
    }
    return null;
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
