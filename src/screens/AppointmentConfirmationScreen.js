/**
 * AppointmentConfirmationScreen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook — Appointment Confirmation Screen (shown after a successful booking)
 *
 * Sections (top → bottom):
 *  1. Accent bar       — 6px gradient strip (#4A7C59 → #78A886)
 *  2. Brand row        — home icon | "VetBook" wordmark | notifications bell
 *  3. Success badge    — 80px pale-green circle, 56px green core, glow rings
 *  4. Heading          — "Appointment Confirmed!" + subtitle
 *  5. Summary card     — booking ref + status, pet row, info items, SMS note
 *  6. Add to Calendar  — amber link
 *  7. Actions          — "View My Appointments" (primary) / "Back to Home"
 *
 * Route params (all optional — the screen degrades gracefully):
 *  { appointment, pet, branch, date ('YYYY-MM-DD'), time ('HH:mm'), reason }
 *
 * Gradients use expo-linear-gradient (see GradientBar).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, fonts, fontSizes, spacing, radii, shadows } from '../theme';

// ─── Constants ───────────────────────────────────────────────────────────────

const BRANCH_ADDRESSES = {
  'Mabini Branch': '142 Mabini St., Poblacion',
  'Batangas City Branch': 'N.F. Almario Building, Kumintang Ilaya',
};

const EST_DURATION_MIN = 45;
const GRADIENT_COLORS = ['#4A7C59', '#78A886'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');

/** Parses 'YYYY-MM-DD' (or a Date) as a LOCAL date, avoiding the UTC day-shift. */
const parseLocalDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value) ? null : value;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  return isNaN(d) ? null : d;
};

/** minutes-from-midnight → '2:30 PM' */
const formatMinutes = (total) => {
  const h24 = Math.floor(total / 60) % 24;
  const m = total % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad(m)} ${suffix}`;
};

/** '10:00' → '10:00 AM - 10:45 AM (GMT+8)' */
const formatTimeRange = (time) => {
  if (!time) return 'Time TBD';
  const [h, m] = String(time).split(':').map(Number);
  if (Number.isNaN(h)) return 'Time TBD';
  const start = h * 60 + (m || 0);
  return `${formatMinutes(start)} - ${formatMinutes(start + EST_DURATION_MIN)} (GMT+8)`;
};

// ─── Small components ────────────────────────────────────────────────────────

/** Left → right accent gradient bar. */
const GradientBar = ({ height, style }) => (
  <LinearGradient
    colors={GRADIENT_COLORS}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 0 }}
    style={[{ height, width: '100%' }, style]}
  />
);

const InfoItem = ({ icon, label, value, subValue, last }) => (
  <View style={[styles.infoItem, !last && styles.infoItemBorder]}>
    <View style={styles.infoIconCircle}>
      <Ionicons name={icon} size={18} color={colors.primary} />
    </View>
    <View style={styles.infoTextWrap}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
      {!!subValue && <Text style={styles.infoSub}>{subValue}</Text>}
    </View>
  </View>
);

// ─── Screen ──────────────────────────────────────────────────────────────────

const AppointmentConfirmationScreen = ({ route, navigation }) => {
  const { appointment, pet, branch, date, time, reason } = route?.params || {};

  // Booking reference
  const bookingRef = appointment?.id
    ? `VB-${String(appointment.id).padStart(6, '0')}`
    : 'VB-000000';

  // Date (parsed as local time so the weekday never shifts by timezone)
  const parsedDate = parseLocalDate(date);
  const formattedDate = parsedDate
    ? parsedDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Date TBD';

  // Branch
  const branchName =
    (typeof branch === 'string' ? branch : branch?.name) ||
    appointment?.branch ||
    'Mabini Branch';
  const branchAddress = BRANCH_ADDRESSES[branchName] ?? 'VetBook Clinic';

  // Pet
  const petName = pet?.name ?? appointment?.pet?.name ?? 'Your pet';
  const petSpecies = pet?.species ?? appointment?.pet?.species;
  const petAge = pet?.age ?? appointment?.pet?.age;
  const petAvatar = pet?.avatar_url ?? appointment?.pet?.avatar_url;
  const ageLabel =
    petAge !== undefined && petAge !== null && petAge !== ''
      ? `${petAge} ${Number(petAge) === 1 ? 'yr' : 'yrs'}`
      : null;
  const petMeta = [petSpecies, ageLabel].filter(Boolean).join(' • ');

  // Reason
  const reasonText = reason || appointment?.reason || 'General visit';

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleViewAppointments = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs', params: { screen: 'Bookings' } }],
    });
  };

  const handleBackHome = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs', params: { screen: 'Home' } }],
    });
  };

  const handleAddToCalendar = () => {
    Alert.alert('Add to Calendar', 'Calendar sync coming soon');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* ── 1. Decorative accent bar ─────────────────────────────────────── */}
      <GradientBar height={6} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 2. Brand row ───────────────────────────────────────────────── */}
        <View style={styles.brandRow}>
          <TouchableOpacity
            onPress={handleBackHome}
            style={styles.brandIconBtn}
            accessibilityLabel="Go to home"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="home-outline" size={22} color={colors.primary} />
          </TouchableOpacity>

          <Text style={styles.wordmark}>VetBook</Text>

          <TouchableOpacity
            onPress={() => Alert.alert('Notifications', 'Coming soon!')}
            style={styles.brandIconBtn}
            accessibilityLabel="Notifications"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* ── 3. Success badge ───────────────────────────────────────────── */}
        <View style={styles.badgeWrap}>
          <View style={styles.glowOuter} />
          <View style={styles.glowInner} />
          <View style={styles.badgeOuter}>
            <View style={styles.badgeInner}>
              <Ionicons name="checkmark" size={32} color={colors.white} />
            </View>
          </View>
        </View>

        {/* ── 4. Heading ─────────────────────────────────────────────────── */}
        <Text style={styles.heading}>Appointment Confirmed!</Text>
        <Text style={styles.subtitle}>
          We've received your booking. A confirmation SMS will be sent shortly.
        </Text>

        {/* ── 5. Summary card ────────────────────────────────────────────── */}
        <View style={styles.card}>
          <GradientBar height={6} />

          <View style={styles.cardBody}>
            {/* Booking ref + status */}
            <View style={styles.refRow}>
              <View style={styles.refPill}>
                <Ionicons name="ticket-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.refText}>{bookingRef}</Text>
              </View>
              <View style={styles.statusBadge}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>CONFIRMED</Text>
              </View>
            </View>

            {/* Pet info row */}
            <View style={styles.petRow}>
              {petAvatar ? (
                <Image source={{ uri: petAvatar }} style={styles.petAvatar} />
              ) : (
                <View style={[styles.petAvatar, styles.petAvatarFallback]}>
                  <Ionicons name="paw" size={24} color={colors.primary} />
                </View>
              )}
              <View style={styles.petInfo}>
                <Text style={styles.petName} numberOfLines={1}>{petName}</Text>
                {!!petMeta && (
                  <View style={styles.petMetaBadge}>
                    <Text style={styles.petMetaText}>{petMeta}</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.divider} />

            {/* Info items */}
            <InfoItem
              icon="location-outline"
              label="Clinic & Branch"
              value={branchName}
              subValue={branchAddress}
            />
            <InfoItem
              icon="calendar-outline"
              label="Date & Time"
              value={formattedDate}
              subValue={formatTimeRange(time)}
            />
            <InfoItem
              icon="clipboard-outline"
              label="Reason"
              value={reasonText}
              last
            />

            {/* SMS note */}
            <View style={styles.smsNote}>
              <Ionicons
                name="phone-portrait-outline"
                size={18}
                color={colors.amber}
                style={styles.smsIcon}
              />
              <Text style={styles.smsText}>
                You'll receive an SMS confirmation and reminder 2 hours before your appointment.
              </Text>
            </View>
          </View>
        </View>

        {/* ── 6. Add to Calendar ─────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.calendarLink}
          onPress={handleAddToCalendar}
          activeOpacity={0.7}
          accessibilityLabel="Add to calendar"
        >
          <Ionicons name="calendar-number-outline" size={18} color={colors.amber} />
          <Text style={styles.calendarText}>Add to Calendar</Text>
        </TouchableOpacity>

        {/* ── 7. Action buttons ──────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={handleViewAppointments}
          activeOpacity={0.85}
          accessibilityLabel="View my appointments"
        >
          <Text style={styles.primaryBtnText}>View My Appointments</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.white} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={handleBackHome}
          activeOpacity={0.7}
          accessibilityLabel="Back to home"
        >
          <Text style={styles.secondaryBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const GLOW_SIZE = 140;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
  },

  // Brand row
  brandRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.base,
    paddingBottom: spacing.sm,
  },
  brandIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.xl,
    color: colors.primary,
    letterSpacing: 0.3,
  },

  // Success badge
  badgeWrap: {
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.base,
    marginBottom: spacing.base,
  },
  glowOuter: {
    position: 'absolute',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
    backgroundColor: colors.primaryPale,
    opacity: 0.25,
  },
  glowInner: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: colors.primaryPale,
    opacity: 0.45,
  },
  badgeOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryPale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Heading
  heading: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.display,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    lineHeight: 21,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.base,
  },

  // Summary card
  card: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    overflow: 'hidden',
    ...shadows.card,
  },
  cardBody: {
    padding: spacing.lg,
  },
  refRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.base,
  },
  refPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    backgroundColor: colors.cardWarm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
  },
  refText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body,
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryPale,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  statusText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.primaryDeep,
    letterSpacing: 0.8,
  },

  // Pet row
  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  petAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.cardWarm,
  },
  petAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryPale,
  },
  petInfo: {
    flex: 1,
    marginLeft: spacing.md,
    alignItems: 'flex-start',
  },
  petName: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.lg,
    color: colors.textPrimary,
  },
  petMetaBadge: {
    marginTop: spacing.xs,
    backgroundColor: colors.cardWarm,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
  },
  petMetaText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.body,
    color: colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.base,
  },

  // Info items
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
  },
  infoItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  infoIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cardWarm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  infoTextWrap: {
    flex: 1,
  },
  infoLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  infoValue: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  infoSub: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // SMS note
  smsNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.cardWarm,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.base,
  },
  smsIcon: {
    marginRight: spacing.sm,
    marginTop: 1,
  },
  smsText: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body,
    lineHeight: 17,
    color: colors.textTertiary,
  },

  // Calendar link
  calendarLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  calendarText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: colors.amber,
    textDecorationLine: 'underline',
  },

  // Buttons
  primaryBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: spacing.base,
    marginTop: spacing.base,
    ...shadows.card,
  },
  primaryBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.white,
  },
  secondaryBtn: {
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  secondaryBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
});

export default AppointmentConfirmationScreen;
