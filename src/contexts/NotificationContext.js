/**
 * NotificationContext.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook — Global In-App Notification Banner Context & Real-Time Alerts
 *
 * Responsibilities:
 *  1. Manages global in-app notification banner state (`showNotificationBanner`, `hideNotificationBanner`).
 *  2. Renders <NotificationBanner /> globally at root level over all navigators.
 *  3. Performs periodic background polling (every 8s) for real-time clinic updates
 *     (e.g., appointment approved, rescheduled, or cancelled by clinic staff).
 *  4. Triggers animated in-app banners and haptic vibration when new unread alerts arrive.
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
import { useAuth } from './AuthContext';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  updatePushToken,
  getVapidPublicKey,
} from '../services/api';
import {
  registerForPushNotificationsAsync,
  requestWebPushPermissionAsync,
  presentLocalNotificationAsync,
  isLocalNotificationToken,
} from '../services/notifications';
import NotificationBanner from '../components/NotificationBanner';
import { navigationRef } from '../navigation/navigationRef';

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
  const activePushTokenRef = useRef(null);

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

            // Native standalone APK fallback: surface a local system tray notification
            // when remote Expo push isn't active.
            if (
              Platform.OS !== 'web' &&
              (!activePushTokenRef.current || isLocalNotificationToken(activePushTokenRef.current))
            ) {
              presentLocalNotificationAsync({
                title: newest.title || 'Clinic Update',
                body:
                  newest.message ||
                  'You have a new update regarding your pet appointment.',
                data: {
                  ...(newest.data || {}),
                  type: newest.type || 'appointment',
                },
              });
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
      activePushTokenRef.current = null;
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
   * Synchronize the device push token or Web Push subscription with the backend.
   * On Web (iOS Safari PWA / Chrome), pass userTriggered=true when invoked from a click/tap.
   */
  const syncPushToken = useCallback(async (userTriggered = false) => {
    try {
      let token = null;

      if (Platform.OS === 'web') {
        let vapidKey = null;
        try {
          const res = await getVapidPublicKey();
          vapidKey = res.data?.public_key;
        } catch (e) {
          console.warn('[Push] Could not fetch VAPID key:', e.message);
        }

        if (userTriggered) {
          token = await requestWebPushPermissionAsync(vapidKey);
        } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          token = await requestWebPushPermissionAsync(vapidKey);
        }
      } else {
        token = await registerForPushNotificationsAsync();
      }

      if (token) {
        activePushTokenRef.current = token;
        await updatePushToken(token);
        console.log('[Push] Successfully registered push token/subscription with backend.');
        return token;
      }
    } catch (err) {
      console.warn('[Push] Failed to sync push token with backend:', err?.message);
    }
    return null;
  }, []);

  /**
   * Remote Push Notifications (Lock Screen, Background & Heads-Up alerts)
   */
  useEffect(() => {
    if (!isAuthenticated) return;

    // 1. Register push token with backend on login
    syncPushToken();

    // 2. Handle notification clicks from Lock Screen / Background
    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data;
      console.log('[Push] Notification tapped from lockscreen/background:', data);
      try {
        if (navigationRef.isReady()) {
          if (data?.type === 'medical_record') {
            navigationRef.navigate('MainTabs', { screen: 'Pets' });
          } else {
            navigationRef.navigate('MainTabs', { screen: 'Bookings' });
          }
        }
      } catch (e) {
        console.warn('Navigation error on notification tap:', e);
      }
    });

    // Check if app was launched directly by tapping a notification while closed/killed
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          const data = response?.notification?.request?.content?.data;
          console.log('[Push] App opened from killed state via notification:', data);
          try {
            if (navigationRef.isReady()) {
              if (data?.type === 'medical_record') {
                navigationRef.navigate('MainTabs', { screen: 'Pets' });
              } else {
                navigationRef.navigate('MainTabs', { screen: 'Bookings' });
              }
            }
          } catch (e) {
            console.warn('Navigation error on initial notification response:', e);
          }
        }
      })
      .catch(() => {});

    return () => {
      responseListener.remove();
    };
  }, [isAuthenticated, syncPushToken]);

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
        syncPushToken,
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
