/**
 * NotificationBanner.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook — In-App Animated Floating Notification Banner
 *
 * Features:
 *  • Smooth spring slide-down and fade-in animation from top
 *  • Pinned at high z-index (above all screens/headers) with safe-area insets
 *  • Elegant VetBook styling: forest-green accent, warm white card, soft drop shadow
 *  • Left badge: Paw or bell icon with live status dot
 *  • Title, message, and relative timestamp ("Just now")
 *  • Auto-dismisses after 5 seconds (configurable)
 *  • Tappable to open relevant appointment / notifications modal
 *  • Dismissible via (X) button
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, fontSizes, radii } from '../theme';

const NotificationBanner = ({
  visible = false,
  title = '',
  message = '',
  type = 'info',
  timestamp = 'Just now',
  onPress = null,
  onDismiss = null,
  autoDismissDelay = 5000,
}) => {
  const insets = useSafeAreaInsets();
  const [isRendered, setIsRendered] = useState(visible);

  const translateY = useRef(new Animated.Value(-160)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setIsRendered(true);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      // Slide down and fade in
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 45,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto dismiss after specified delay
      timerRef.current = setTimeout(() => {
        handleDismiss();
      }, autoDismissDelay);
    } else if (isRendered) {
      handleDismiss();
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [visible]);

  const handleDismiss = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Slide up and fade out
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -160,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsRendered(false);
      onDismiss?.();
    });
  };

  const handlePress = () => {
    handleDismiss();
    onPress?.();
  };

  if (!isRendered) {
    return null;
  }

  // Determine icon & badge accent depending on type / content
  const lowerTitle = (title || '').toLowerCase();
  const lowerType = (type || '').toLowerCase();

  let iconName = 'paw';
  let badgeBg = '#E8F3EB';
  let iconColor = colors.primary; // #4A7C59
  let dotColor = '#4A7C59';

  if (lowerType === 'cancelled' || lowerType === 'cancellation' || lowerTitle.includes('cancel')) {
    iconName = 'close-circle';
    badgeBg = '#FFDAD8';
    iconColor = colors.alertRed;
    dotColor = colors.alertRed;
  } else if (lowerType === 'approved' || lowerTitle.includes('approv') || lowerTitle.includes('confirm')) {
    iconName = 'checkmark-circle';
    badgeBg = '#C8E8D0';
    iconColor = colors.primaryDeep;
    dotColor = '#4A7C59';
  } else if (lowerType === 'reschedule' || lowerTitle.includes('resched')) {
    iconName = 'calendar';
    badgeBg = '#F8E0A8';
    iconColor = colors.amber;
    dotColor = '#D97706';
  } else if (lowerType === 'bell' || lowerTitle.includes('notification')) {
    iconName = 'notifications';
    badgeBg = '#E8F3EB';
    iconColor = colors.primary;
    dotColor = '#4A7C59';
  }

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          top: Math.max(insets.top, Platform.OS === 'ios' ? 14 : 8) + 6,
          transform: [{ translateY }],
          opacity,
        },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.92}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${message}`}
      >
        {/* Subtle left forest-green accent indicator */}
        <View style={[styles.accentIndicator, { backgroundColor: iconColor }]} />

        {/* Left Icon Badge with live dot */}
        <View style={[styles.iconBadge, { backgroundColor: badgeBg }]}>
          <Ionicons name={iconName} size={20} color={iconColor} />
          <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
        </View>

        {/* Content Column */}
        <View style={styles.contentCol}>
          <View style={styles.titleRow}>
            <Text style={styles.titleText} numberOfLines={1}>
              {title || ''}
            </Text>
            <Text style={styles.timeText}>{timestamp || 'Just now'}</Text>
          </View>
          {Boolean(message) ? (
            <Text style={styles.messageText} numberOfLines={2}>
              {message}
            </Text>
          ) : null}
        </View>

        {/* Close / Dismiss (X) */}
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={handleDismiss}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notification"
        >
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 99999,
    elevation: 999,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(74, 124, 89, 0.22)',
    // Soft drop shadow
    shadowColor: '#2E3230',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  accentIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    position: 'relative',
  },
  statusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  contentCol: {
    flex: 1,
    marginRight: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  titleText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md, // 14
    color: colors.textPrimary,
    flex: 1,
    marginRight: 6,
  },
  timeText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs, // 10
    color: colors.textMuted,
  },
  messageText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body, // 12
    color: colors.textSecondary,
    lineHeight: 16,
  },
  closeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FAF6F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default NotificationBanner;

