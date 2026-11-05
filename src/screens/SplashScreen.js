/**
 * SplashScreen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook — Launch / Splash Screen
 *
 * Figma spec:
 *  • Background: #FAF6F0 + soft green & yellow ambient blur blobs
 *  • Center: leaf+paw icon inside a 96×96 cream rounded square
 *  • Brand:  "VetBook"   — Literata 36 px bold, #2E3230
 *  • Tagline: "Your pet's health, in your hands" — Nunito Sans 16 px, #4A4E4A
 *  • Divider: dot – line – dot pattern
 *  • Bottom: ActivityIndicator spinner + "Version 1.0.0"
 *  • Top-left: green dot + "BK PETAHOLIC ANIMAL CLINIC" (12 px, letter-spaced)
 *  • Top-right: "EST 2024" (12 px, letter-spaced)
 *
 * Navigation: auto-advances to "Login" after 2.5 s.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, fontSizes, spacing, radii } from '../theme';
import { useAuth } from '../contexts/AuthContext';

// ─── Auto-advance delay (ms) ────────────────────────────────────────────────
const SPLASH_DURATION = 2500;

// ─── Component ───────────────────────────────────────────────────────────────
const SplashScreen = ({ navigation }) => {
  const { isAuthenticated } = useAuth();

  /**
   * Auto-navigate to MainTabs if authenticated, or Login screen after SPLASH_DURATION ms.
   * The cleanup function cancels the timer if the component unmounts early
   * (e.g. fast hardware navigation) to prevent a no-op state update.
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isAuthenticated) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'MainTabs', params: { screen: 'Home' } }],
        });
      } else {
        navigation.replace('Login');
      }
    }, SPLASH_DURATION);

    return () => clearTimeout(timer);
  }, [navigation, isAuthenticated]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* ── Ambient background blobs ─────────────────────────────────────── */}
      {/* Green blob — upper-right quadrant */}
      <View style={[styles.blob, styles.blobGreen]} />
      {/* Yellow blob — lower-left quadrant */}
      <View style={[styles.blob, styles.blobYellow]} />

      {/* ── Top bar: clinic label (left) + EST 2024 (right) ─────────────── */}
      <View style={styles.topBar}>
        {/* Left: status dot + clinic name */}
        <View style={styles.clinicRow}>
          <View style={styles.greenDot} />
          <Text style={styles.clinicText}>BK PETAHOLIC ANIMAL CLINIC</Text>
        </View>

        {/* Right: establishment year */}
        <Text style={styles.estText}>EST 2024</Text>
      </View>

      {/* ── Center content ───────────────────────────────────────────────── */}
      <View style={styles.centerContent}>

        {/* Icon badge: cream rounded square with leaf + paw */}
        <View style={styles.iconBadge}>
          {/* Leaf — rendered as a rotated Ionicons leaf icon */}
          <Ionicons
            name="leaf"
            size={32}
            color={colors.primary}
            style={styles.leafIcon}
          />
          {/* Paw — overlaid in the lower-right corner of the badge */}
          <View style={styles.pawOverlay}>
            <Ionicons name="paw" size={20} color={colors.primaryLight} />
          </View>
        </View>

        {/* Brand name */}
        <Text style={styles.brandName}>VetBook</Text>

        {/* Tagline */}
        <Text style={styles.tagline}>Your pet's health, in your hands</Text>

        {/* Divider: dot – line – dot */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerDot} />
          <View style={styles.dividerLine} />
          <View style={styles.dividerDot} />
        </View>
      </View>

      {/* ── Bottom: spinner + version ────────────────────────────────────── */}
      <View style={styles.bottomSection}>
        <ActivityIndicator
          size="small"
          color={colors.primary}
          style={styles.spinner}
        />
        <Text style={styles.versionText}>Version 1.0.0</Text>
      </View>
    </SafeAreaView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  /* Full-screen cream background */
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── Ambient blobs ──────────────────────────────────────────────────────────
  blob: {
    position: 'absolute',
    borderRadius: 9999,
    // React Native doesn't support CSS blur natively without a library;
    // we approximate with very low opacity to give a soft tinted wash.
    opacity: 0.18,
  },
  blobGreen: {
    width: 280,
    height: 280,
    backgroundColor: colors.primaryPale,   // #C8E8D0
    top: -60,
    right: -80,
  },
  blobYellow: {
    width: 240,
    height: 240,
    backgroundColor: colors.cardYellow,    // #F8E0A8
    bottom: 80,
    left: -80,
  },

  // ── Top bar ────────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  clinicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 9999,
    backgroundColor: colors.primary,       // #4A7C59
  },
  clinicText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.body,              // 12 px
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  estText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.body,              // 12 px
    color: colors.textMuted,
    letterSpacing: 1.2,
  },

  // ── Center block ──────────────────────────────────────────────────────────
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },

  /* Icon badge — 96×96 cream rounded square */
  iconBadge: {
    width: 96,
    height: 96,
    borderRadius: radii.xl,               // 24 px
    backgroundColor: colors.cardBeige,    // #F0ECE4
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
    // Subtle shadow to lift the card off the background
    shadowColor: colors.textPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  leafIcon: {
    // Slight tilt gives an organic, natural feel matching Figma
    transform: [{ rotate: '-20deg' }],
  },
  pawOverlay: {
    position: 'absolute',
    bottom: 14,
    right: 14,
  },

  /* "VetBook" — Literata Bold 36 px */
  brandName: {
    fontFamily: fonts.headingBold,         // Literata_700Bold
    fontSize: fontSizes.mega,              // 36 px
    color: colors.textPrimary,            // #2E3230
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },

  /* Tagline — Nunito Sans 16 px */
  tagline: {
    fontFamily: fonts.bodyRegular,         // NunitoSans_400Regular
    fontSize: fontSizes.lg,               // 16 px
    color: colors.textTertiary,           // #4A4E4A
    textAlign: 'center',
    marginBottom: spacing.xl,
  },

  // ── Divider: dot – line – dot ──────────────────────────────────────────────
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dividerDot: {
    width: 5,
    height: 5,
    borderRadius: 9999,
    backgroundColor: colors.borderDashed,  // #C4C8BC
  },
  dividerLine: {
    width: 56,
    height: 1,
    backgroundColor: colors.borderDashed,
  },

  // ── Bottom section ─────────────────────────────────────────────────────────
  bottomSection: {
    alignItems: 'center',
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  spinner: {
    marginBottom: spacing.xs,
  },
  versionText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body,             // 12 px
    color: colors.textMuted,             // #74796E
    letterSpacing: 0.4,
  },
});

export default SplashScreen;
