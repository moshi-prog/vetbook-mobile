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
 */
export async function registerForPushNotificationsAsync() {
  let token = null;

  if (Platform.OS === 'web') {
    return null;
  }

  // Set up Android High-Priority Channel for Lock Screen & Heads-Up display
  if (Platform.OS === 'android') {
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
  }

  // Push notifications only work on real physical devices
  if (!Device.isDevice) {
    console.warn('[Push] Remote push notifications require a physical device.');
    return null;
  }

  // Check & request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Push] Push notification permission denied.');
    return null;
  }

  // Get project ID from EAS config
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;

  try {
    const pushTokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : {}
    );
    token = pushTokenData.data;
    console.log('[Push] Device Expo Push Token:', token);
  } catch (error) {
    console.error('[Push] Failed to get Expo push token:', error);
  }

  return token;
}

