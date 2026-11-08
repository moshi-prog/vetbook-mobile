/**
 * NotificationContext.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook — Global In-App Notification Banner Context & Real-Time Alerts
 *
 * Responsibilities:
 *  1. Manages global in-app notification banner state (`showNotificationBanner`, `hideNotificationBanner`).
 *  2. Renders <NotificationBanner /> globally at root level over all navigators.
 *  3. Performs periodic background polling (every 25s) for real-time admin updates
 *     (e.g., appointment approved, rescheduled, or cancelled by clinic staff).
 *  4. Triggers animated banners and haptic vibration when new unread alerts arrive.
 *  5. Synchronizes unread counter and notification records across the app.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import { Vibration, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useAuth } from './AuthContext';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  updatePushToken,
} from '../services/api';
import NotificationBanner from '../components/NotificationBanner';
import { navigationRef } from '../navigation/navigationRef';

// Configure notification behavior for lock screen, background, and foreground alerts
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerForPushNotificationsAsync() {
  let token = null;

  // Request notification permissions (required on Android 13+ and iOS for both local and remote notifications)
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('[NOTIFICATION] Permissions not granted for notifications (status: ' + finalStatus + ')');
    }
  } catch (e) {
    // Gracefully handle permission check error
  }

  // Create Android notification channel safely
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4A7C59',
        enableVibrate: true,
        showBadge: true,
      });
    } catch (e) {
      // Safe fallback for Expo Go / emulator channel issues
    }
  }

  // In Expo Go (SDK 53+), remote FCM token generation is disabled; native local notifications are used instead
  if (Constants?.appOwnership === 'expo' || Constants?.executionEnvironment === 'storeClient') {
    console.log('[PUSH] Running in Expo Go: using native local system notifications');
    return null;
  }

  if (Device.isDevice) {
    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId ??
        '45c6f071-23ad-4887-8e0b-2c975198c3ae';

      const pushTokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      token = pushTokenData?.data || null;

      if (token) {
        console.log('[PUSH] Expo Push Token obtained:', token);
      }
    } catch (e) {
      console.warn('[PUSH] Error getting push token:', e.message);
    }
  } else {
    console.log('[PUSH] Running on simulator/emulator; physical device required for native remote push');
  }

  return token;
}

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();

  // Banner State
  const [banner, setBanner] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    timestamp: 'Just now',
    appointmentId: null,
    onPress: null,
  });

  // Notifications State & Unread Counter
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Tracking seen notification IDs to detect newly arrived alerts during polling
  const knownNotificationIds = useRef(new Set());
  const initialLoadDone = useRef(false);

  /**
   * Global helper to trigger the animated in-app notification banner
   */
  const showNotificationBanner = useCallback(
    ({
      title,
      message,
      type = 'info',
      timestamp = 'Just now',
      appointmentId = null,
      onPress = null,
    }) => {
      setBanner({
        visible: true,
        title: title || 'Clinic Notification',
        message: message || '',
        type,
        timestamp,
        appointmentId,
        onPress:
          onPress ||
          (() => {
            // Default on-tap behavior: navigate to Appointments tab
            try {
              if (navigationRef.isReady()) {
                navigationRef.navigate('MainTabs', { screen: 'Bookings' });
              }
            } catch (err) {
              // Graceful fallback
            }
          }),
      });
    },
    []
  );

  /**
   * Dismiss the banner
   */
  const hideNotificationBanner = useCallback(() => {
    setBanner((prev) => ({ ...prev, visible: false }));
  }, []);

  /**
   * Fetch notifications from backend API and check for new unread alerts
   */
  const fetchNotifications = useCallback(
    async (silent = false) => {
      if (!isAuthenticated) return;

      try {
        if (!silent) setLoading(true);
        const res = await getNotifications();
        const list = res.data?.notifications ?? [];
        const count = res.data?.unread_count ?? 0;

        setNotifications(list);
        setUnreadCount(count);

        if (!initialLoadDone.current) {
          // On first fetch, record all existing notification IDs so we don't spam old banners
          list.forEach((n) => knownNotificationIds.current.add(n.id));
          initialLoadDone.current = true;
        } else {
          // Detect newly arrived unread notifications during subsequent poll
          const newUnreads = list.filter(
            (n) => !n.read_at && !knownNotificationIds.current.has(n.id)
          );

          if (newUnreads.length > 0) {
            // Present the newest alert
            const newest = newUnreads[0];
            newUnreads.forEach((n) => knownNotificationIds.current.add(n.id));

            showNotificationBanner({
              title: newest.title || 'Clinic Update',
              message:
                newest.message ||
                'You have a new update regarding your pet appointment.',
              type: newest.type || 'appointment',
              appointmentId: newest.data?.appointment_id,
            });

            // Trigger real native operating system notification (banner, vibration, lockscreen, notification tray)
            try {
              Notifications.scheduleNotificationAsync({
                content: {
                  title: newest.title || 'VetBook Clinic Update',
                  body: newest.message || 'You have an update regarding your pet.',
                  sound: 'default',
                  data: newest.data || {},
                },
                trigger: null,
              }).catch((e) => {
                // Ignore background local scheduling errors
              });
            } catch (e) {
              // Ignore background local scheduling errors
            }

            // Gentle haptic feedback
            try {
              Vibration.vibrate(80);
            } catch (e) {
              // Ignored if device lacks vibration support
            }
          }
        }
      } catch (err) {
        // Network glitches degrade gracefully without UI disruption
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [isAuthenticated, showNotificationBanner]
  );

  /**
   * Periodic background polling: every 8 seconds when user is authenticated
   */
  useEffect(() => {
    if (!isAuthenticated) {
      knownNotificationIds.current.clear();
      initialLoadDone.current = false;
      setNotifications([]);
      setUnreadCount(0);
      setBanner((prev) => ({ ...prev, visible: false }));
      return;
    }

    // Initial fetch on sign in
    fetchNotifications(true);

    // 8-second polling loop for real-time clinic updates
    const pollInterval = setInterval(() => {
      fetchNotifications(true);
    }, 8000);

    return () => clearInterval(pollInterval);
  }, [isAuthenticated, fetchNotifications]);

  /**
   * Register push notifications on physical devices and attach push listeners
   */
  useEffect(() => {
    if (!isAuthenticated) return;

    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        updatePushToken(token)
          .then(() => {
            console.log('[PUSH] Token successfully registered with backend');
          })
          .catch((err) => {
            console.warn('[PUSH] Failed to save push token on backend:', err?.message || err);
          });
      }
    });

    let receivedSub;
    let responseSub;

    try {
      receivedSub = Notifications.addNotificationReceivedListener((notification) => {
        const { title, body, data } = notification?.request?.content || {};
        showNotificationBanner({
          title: title || 'Clinic Update',
          message: body || 'You have an update regarding your pet.',
          type: data?.type || 'appointment',
          appointmentId: data?.appointment_id,
        });
      });

      responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
        try {
          if (navigationRef.isReady()) {
            navigationRef.navigate('MainTabs', { screen: 'Bookings' });
          }
        } catch (err) {}
      });
    } catch (e) {}

    return () => {
      if (receivedSub) receivedSub.remove();
      if (responseSub) responseSub.remove();
    };
  }, [isAuthenticated, showNotificationBanner]);

  /**
   * Mark individual notification as read
   */
  const markAsRead = useCallback(async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, read_at: new Date().toISOString() } : n
        )
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (e) {
      // Ignored
    }
  }, []);

  /**
   * Mark all notifications as read
   */
  const markAllAsRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          read_at: n.read_at || new Date().toISOString(),
        }))
      );
      setUnreadCount(0);
    } catch (e) {
      // Ignored
    }
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        banner,
        showNotificationBanner,
        hideNotificationBanner,
        notifications,
        unreadCount,
        loadingNotifications: loading,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
      }}
    >
      {children}

      {/* Floating Animated In-App Notification Banner */}
      <NotificationBanner
        visible={banner.visible}
        title={banner.title}
        message={banner.message}
        type={banner.type}
        timestamp={banner.timestamp}
        onPress={banner.onPress}
        onDismiss={hideNotificationBanner}
      />
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

export default NotificationContext;

