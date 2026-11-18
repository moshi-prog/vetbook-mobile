/**
 * NotificationContext.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook — Global In-App Notification Banner Context & Real-Time Alerts
 *
 * Responsibilities:
 *  1. Manages global in-app notification banner state (`showNotificationBanner`, `hideNotificationBanner`).
 *  2. Renders <NotificationBanner /> globally at root level over all navigators.
 *  3. Performs periodic foreground polling (every 30s) for real-time clinic updates
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
import {
  Vibration,
  Platform,
  AppState,
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useAuth } from './AuthContext';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  updatePushToken,
  getVapidPublicKey,
  confirmAppointmentAttendance,
  cancelAppointment,
} from '../services/api';
import {
  registerForPushNotificationsAsync,
  requestWebPushPermissionAsync,
  presentLocalNotificationAsync,
  isLocalNotificationToken,
} from '../services/notifications';
import NotificationBanner from '../components/NotificationBanner';
import { navigationRef } from '../navigation/navigationRef';
import { colors, fonts, fontSizes, spacing, radii, shadows } from '../theme';

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
  const [reminderModalBusy, setReminderModalBusy] = useState(false);

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
   * Periodic foreground polling: every 30 seconds when user is authenticated & app is active
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

    let currentAppState = AppState.currentState || 'active';
    let pollInterval = null;

    const startPolling = () => {
      if (!pollInterval) {
        pollInterval = setInterval(() => {
          fetchNotifications(true);
        }, 30000);
      }
    };

    const stopPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    // Initial fetch and start polling only while active
    if (currentAppState === 'active') {
      fetchNotifications(true);
      startPolling();
    }

    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        if (currentAppState !== 'active') {
          fetchNotifications(true);
        }
        startPolling();
      } else {
        stopPolling();
      }
      currentAppState = nextAppState;
    });

    return () => {
      stopPolling();
      appStateSubscription?.remove?.();
    };
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

  const activeReminderModal = isAuthenticated
    ? notifications.find(
        (n) =>
          !n.read_at &&
          n.data?.requires_confirmation &&
          (n.type === 'appointment_reminder_2h' ||
            n.type === 'appointment_reminder_3h' ||
            n.type === 'appointment_reminder_24h')
      )
    : null;

  const isUrgentReminder = Boolean(
    activeReminderModal?.data?.is_urgent_2h ||
      activeReminderModal?.type === 'appointment_reminder_2h' ||
      activeReminderModal?.type === 'appointment_reminder_3h'
  );

  const handleConfirmReminderAttendance = useCallback(async () => {
    if (!activeReminderModal || reminderModalBusy) return;
    const apptId = activeReminderModal.data?.appointment_id;
    setReminderModalBusy(true);
    try {
      if (apptId) {
        await confirmAppointmentAttendance(apptId);
      }
    } catch (e) {
      // Fall through to mark read so confirmed/stale alerts dismiss cleanly
    } finally {
      await markAsRead(activeReminderModal.id);
      setReminderModalBusy(false);
      fetchNotifications(true);
    }
  }, [activeReminderModal, reminderModalBusy, markAsRead, fetchNotifications]);

  const handleCancelFromReminder = useCallback(async () => {
    if (!activeReminderModal || reminderModalBusy) return;
    const apptId = activeReminderModal.data?.appointment_id;
    setReminderModalBusy(true);
    try {
      if (apptId) {
        await cancelAppointment(apptId, {
          cancel_reason: 'Cancelled from appointment reminder prompt',
        });
      }
    } catch (e) {
      // Fall through to mark read
    } finally {
      await markAsRead(activeReminderModal.id);
      setReminderModalBusy(false);
      fetchNotifications(true);
    }
  }, [activeReminderModal, reminderModalBusy, markAsRead, fetchNotifications]);

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

      {/* Global Centered Non-Dismissible Interactive Appointment Reminder Popup */}
      <Modal
        visible={!!activeReminderModal}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={reminderStyles.overlay}>
          {activeReminderModal && (
            <View style={reminderStyles.card}>
              <View style={[reminderStyles.badgeRow, isUrgentReminder ? reminderStyles.badgeUrgent : reminderStyles.badgeStandard]}>
                <Ionicons
                  name={isUrgentReminder ? 'alarm-outline' : 'calendar-outline'}
                  size={15}
                  color={isUrgentReminder ? '#BA1A1A' : '#4A7C59'}
                />
                <Text style={[reminderStyles.badgeText, isUrgentReminder ? reminderStyles.badgeTextUrgent : reminderStyles.badgeTextStandard]}>
                  {isUrgentReminder ? 'URGENT 2-HOUR APPOINTMENT REMINDER' : '1-DAY APPOINTMENT REMINDER'}
                </Text>
              </View>

              <Text style={reminderStyles.title}>{activeReminderModal.title}</Text>
              <Text style={reminderStyles.message}>{activeReminderModal.message}</Text>

              <View style={reminderStyles.warningBox}>
                <Text style={reminderStyles.warningText}>
                  ⚠️ Important: Choosing to ignore this reminder will result in automatic appointment cancellation after a 1-hour waiting time.
                </Text>
              </View>

              <View style={reminderStyles.btnCol}>
                <TouchableOpacity
                  style={reminderStyles.continueBtn}
                  activeOpacity={0.88}
                  disabled={reminderModalBusy}
                  onPress={handleConfirmReminderAttendance}
                >
                  {reminderModalBusy ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color={colors.white} />
                      <Text style={reminderStyles.continueBtnText}>Yes, Continue Appointment</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={reminderStyles.cancelBtn}
                  activeOpacity={0.85}
                  disabled={reminderModalBusy}
                  onPress={handleCancelFromReminder}
                >
                  <Ionicons name="close-circle-outline" size={18} color="#BA1A1A" />
                  <Text style={reminderStyles.cancelBtnText}>Cancel Appointment</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </NotificationContext.Provider>
  );
};

const reminderStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(46, 50, 48, 0.58)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.base,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FAF6F0',
    borderRadius: 24,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: '#EAE6DE',
    ...shadows.card,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeUrgent: { backgroundColor: '#FFDAD8' },
  badgeStandard: { backgroundColor: '#C8E8D0' },
  badgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  badgeTextUrgent: { color: '#690005' },
  badgeTextStandard: { color: '#2A6038' },
  title: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.xl,
    color: colors.textPrimary,
  },
  message: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    lineHeight: 21,
  },
  warningBox: {
    backgroundColor: '#FFF3CD',
    borderWidth: 1,
    borderColor: '#F3D68D',
    borderRadius: radii.md,
    padding: spacing.md,
  },
  warningText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: '#664D03',
    lineHeight: 19,
  },
  btnCol: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  continueBtn: {
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: '#4A7C59',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  continueBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: colors.white,
  },
  cancelBtn: {
    height: 46,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: '#F2C6C6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cancelBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: '#BA1A1A',
  },
});

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

export default NotificationContext;
