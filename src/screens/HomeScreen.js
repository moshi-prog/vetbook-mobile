/**
 * HomeScreen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook — Home Dashboard Screen
 *
 * Sections (top → bottom):
 *  1. Top App Bar   — paw badge + "VetBook" wordmark | bell + avatar
 *  2. Greeting      — time-aware salutation + user name + health tip
 *  3. Quick Actions — 2×2 card grid (Book Visit, My Pets, Vet Chat, Call)
 *  4. Emergency Card — Need Immediate Veterinary Care? + Call Clinic button
 *  5. Upcoming Appointments — fetched from API, shows pending & approved visits
 *  6. Clinic Info   — hours, branches, contact options
 *
 * Data:
 *  - Appointments fetched from GET /user/appointments on mount + pull-to-refresh
 *  - User name & auth state from useAuth()
 *  - Greeting computed from current device time
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  Modal,
  ActivityIndicator,
  Linking,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, fontSizes, spacing, radii, shadows, statusColors } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import {
  getUserAppointments,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getBranches,
} from '../services/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns a time-aware greeting string based on current hour.
 * 00–11  → "Good Morning"
 * 12–17  → "Good Afternoon"
 * 18–23  → "Good Evening"
 */
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
};

/** Extracts first name from a full name string. */
const getFirstName = (fullName) =>
  fullName ? fullName.trim().split(' ')[0] : 'there';

/** Formats 'YYYY-MM-DD' or ISO date string to e.g. "Nov 6, 2026" without timezone drift. */
const formatDate = (value) => {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  const d = new Date(value);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
};

/** Formats '14:30' | '14:30:00' to '2:30 PM'. */
const formatTime = (value) => {
  if (!value) return '';
  const [h, m] = String(value).split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, '0')} ${suffix}`;
};

/** Formats appointment date and time nicely together, e.g. "Nov 6, 2026 · 10:00 AM". */
const formatAppointmentDateTime = (dateVal, timeVal) => {
  const dStr = formatDate(dateVal);
  const tStr = formatTime(timeVal);
  if (dStr !== '—' && tStr) {
    return `${dStr} · ${tStr}`;
  }
  if (dStr !== '—') return dStr;
  return tStr || '—';
};

/** Maps a status string to theme colors, indicator dot, and user-friendly label. */
const statusStyle = (status) => {
  const norm = (status ?? '').toLowerCase();
  switch (norm) {
    case 'approved':
      return {
        bg: statusColors.approved.bg,
        text: statusColors.approved.text,
        dot: statusColors.approved.dot,
        label: 'Confirmed',
      };
    case 'pending':
      return {
        bg: statusColors.pending.bg,
        text: statusColors.pending.text,
        dot: statusColors.pending.dot,
        label: 'Pending Review',
      };
    case 'completed':
      return {
        bg: statusColors.completed.bg,
        text: statusColors.completed.text,
        dot: statusColors.completed.dot,
        label: 'Completed',
      };
    case 'cancelled':
      return {
        bg: statusColors.cancelled.bg,
        text: statusColors.cancelled.text,
        dot: statusColors.cancelled.dot,
        label: 'Cancelled',
      };
    default:
      return {
        bg: colors.cardWarm,
        text: colors.textMuted,
        dot: colors.textMuted,
        label: status ?? 'Pending',
      };
  }
};

// ─── Branch Data ─────────────────────────────────────────────────────────────

const DEFAULT_CLINIC_BRANCHES = [
  {
    id: 'mabini',
    name: 'Mabini Branch',
    address: '142 Mabini St., Poblacion, Mabini, Batangas',
    addressSummary: '142 Mabini St., Poblacion, Mabini',
    hoursWeekday: 'Mon–Sat: 9:00 AM – 6:00 PM',
    hoursSunday: 'Sun: 10:00 AM – 4:00 PM',
    phone: '0917-123-4567',
    dialUrl: 'tel:09171234567',
  },
  {
    id: 'batangas_city',
    name: 'Batangas City Branch',
    address: 'N.F. Almario Bldg, Kumintang Ilaya, Batangas City',
    addressSummary: 'N.F. Almario Bldg, Kumintang Ilaya',
    hoursWeekday: 'Mon–Sat: 9:00 AM – 6:00 PM',
    hoursSunday: 'Sun: 10:00 AM – 4:00 PM',
    phone: '0918-765-4321',
    dialUrl: 'tel:09187654321',
  },
];

// ─────────────────────────────────────────────────────────────────────────────

const HomeScreen = ({ navigation }) => {
  const { user, logout } = useAuth();

  // ── State ──────────────────────────────────────────────────────────────────
  const [appointments, setAppointments] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  // Branch Phone Call Modal State
  const [callModalVisible, setCallModalVisible] = useState(false);
  const [branches, setBranches] = useState(DEFAULT_CLINIC_BRANCHES);
  const [clinic, setClinic] = useState({
    name: 'BK Petaholic Animal Clinic',
    tagline: 'Compassionate Care for Batangas Pets',
    email: 'info@bkpetaholic.com',
    accreditation: 'BAI-RVD-2024-0089',
    logo_url: null,
  });
  const [logoLoadError, setLogoLoadError] = useState(false);

  // Global Notifications State & Real-Time Alerts
  const {
    unreadCount,
    notifications,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotification();
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchAppointments = useCallback(async () => {
    try {
      const response = await getUserAppointments();
      // Support { appointments: [...] }, { data: [...] }, and direct array shapes
      const list = Array.isArray(response.data?.appointments)
        ? response.data.appointments
        : Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
        ? response.data
        : [];
      setAppointments(list);
    } catch (err) {
      // Gracefully degrade — show empty state rather than crashing
      console.warn('Could not load appointments:', err?.response?.status ?? err.message);
      setAppointments([]);
    }
  }, []);

  const fetchBranches = useCallback(async () => {
    try {
      const response = await getBranches();
      const list = response.data?.data;
      if (Array.isArray(list) && list.length > 0) {
        setBranches(list);
      }
      if (response.data?.clinic) {
        setLogoLoadError(false);
        setClinic((prev) => ({
          ...prev,
          ...response.data.clinic,
        }));
      }
    } catch (err) {
      console.warn('Could not refresh clinic branch info:', err.message);
    }
  }, []);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  // Re-fetch appointments, notifications, and branch hotlines whenever Home tab is focused
  useFocusEffect(
    useCallback(() => {
      fetchAppointments();
      fetchNotifications();
      fetchBranches();
    }, [fetchAppointments, fetchNotifications, fetchBranches])
  );

  // ── Pull-to-refresh ────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchAppointments(), fetchNotifications(), fetchBranches()]);
    setRefreshing(false);
  }, [fetchAppointments, fetchNotifications, fetchBranches]);

  const handleOpenNotifications = async () => {
    setNotifModalVisible(true);
    setLoadingNotifs(true);
    await fetchNotifications();
    setLoadingNotifs(false);
  };

  const handleMarkOneRead = async (id) => {
    await markAsRead(id);
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
  };

  const formatRelativeTime = (dateStr) => {
    if (!dateStr) return '';
    const diff = (new Date() - new Date(dateStr)) / 1000; // in seconds
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleDialBranch = async (branch) => {
    try {
      await Linking.openURL(branch.dialUrl);
    } catch (err) {
      Alert.alert('Phone Call', `Unable to open dialer. You can call ${branch.phone} directly.`);
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const greeting   = getGreeting();
  const firstName  = getFirstName(user?.name || user?.user?.name);

  // Show upcoming appointments if status is 'approved' OR 'pending' (today or future dates)
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const localTodayStr = `${year}-${month}-${day}`;

  const upcomingAppointments = appointments
    .filter((a) => {
      const status = (a.status ?? '').toLowerCase();
      if (status !== 'approved' && status !== 'pending') return false;

      const rawDate = a.appointment_date ?? a.scheduled_at;
      if (!rawDate) return true;
      const apptDateStr = String(rawDate).slice(0, 10);
      return apptDateStr >= localTodayStr;
    })
    .sort((a, b) => {
      const dateA = `${String(a.appointment_date ?? a.scheduled_at ?? '').slice(0, 10)} ${String(a.appointment_time ?? '').slice(0, 5)}`;
      const dateB = `${String(b.appointment_date ?? b.scheduled_at ?? '').slice(0, 10)} ${String(b.appointment_time ?? '').slice(0, 5)}`;
      return dateA.localeCompare(dateB);
    });

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>

      {/* ── 1. Top App Bar ──────────────────────────────────────────────── */}
      <View style={styles.appBar}>
        {/* Left: paw badge + wordmark */}
        <View style={styles.appBarLeft}>
          <View style={styles.pawBadge}>
            <Ionicons name="paw-outline" size={16} color={colors.white} />
          </View>
          <Text style={styles.wordmark}>VetBook</Text>
        </View>

        {/* Right: notification bell + avatar */}
        <View style={styles.appBarRight}>
          {/* Bell with unread counter/dot */}
          <TouchableOpacity
            style={styles.bellWrapper}
            accessibilityLabel="Notifications"
            onPress={handleOpenNotifications}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
            {unreadCount > 0 ? (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>

          {/* User avatar circle */}
          <TouchableOpacity
            style={styles.avatarCircle}
            accessibilityLabel="Profile"
            onPress={() => navigation.navigate('Profile')}
          >
            <Text style={styles.avatarInitial}>
              {firstName.charAt(0).toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Scrollable body ──────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >

        {/* ── 2. Greeting Section ────────────────────────────────────────── */}
        <View style={styles.greetingSection}>
          <Text style={styles.greetingLabel}>{greeting.toUpperCase()}</Text>
          <Text style={styles.greetingHeading}>Hi, {firstName}!</Text>
          <Text style={styles.greetingSubtitle}>
            Time for a health check? Book an appointment and keep your pets happy and healthy. 🐾
          </Text>
        </View>

        {/* ── 3. Quick Actions 2×2 Grid ─────────────────────────────────── */}
        <View style={styles.quickActionsGrid}>

          {/* Card 1 — Book Visit (primary / green) */}
          <TouchableOpacity
            style={[styles.quickCard, styles.quickCardPrimary]}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('BookAppointment')}
            accessibilityLabel="Book an appointment"
          >
            <View style={[styles.quickIconCircle, styles.quickIconCirclePrimary]}>
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.quickCardText}>
              <Text style={[styles.quickCardTitle, styles.quickCardTitleWhite]}>Book Visit</Text>
              <Text style={[styles.quickCardSub, styles.quickCardSubWhite]}>Schedule appointment</Text>
            </View>
          </TouchableOpacity>

          {/* Card 2 — My Pets */}
          <TouchableOpacity
            style={styles.quickCard}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Pets')}
            accessibilityLabel="My pets"
          >
            <View style={styles.quickIconCircle}>
              <Ionicons name="paw-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.quickCardText}>
              <Text style={styles.quickCardTitle}>My Pets</Text>
              <Text style={styles.quickCardSub}>View profiles</Text>
            </View>
          </TouchableOpacity>

          {/* Card 3 — AI Chat */}
          <TouchableOpacity
            style={styles.quickCard}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Chat')}
            accessibilityLabel="AI chat"
          >
            <View style={styles.quickIconCircle}>
              <Ionicons name="chatbubbles-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.quickCardText}>
              <Text style={styles.quickCardTitle}>AI Chat</Text>
              <Text style={styles.quickCardSub}>24/7 AI assistant</Text>
            </View>
          </TouchableOpacity>

          {/* Card 4 — Call Clinic (emergency) */}
          <TouchableOpacity
            style={styles.quickCard}
            activeOpacity={0.85}
            onPress={() => setCallModalVisible(true)}
            accessibilityLabel="Call clinic"
          >
            <View style={[styles.quickIconCircle, styles.quickIconCircleRed]}>
              <Ionicons name="call-outline" size={20} color={colors.alertRed} />
            </View>
            <View style={styles.quickCardText}>
              <Text style={styles.quickCardTitle}>Call Clinic</Text>
              <Text style={styles.quickCardSub}>Emergency contact</Text>
            </View>
          </TouchableOpacity>

        </View>

        {/* ── Emergency Card ───────────────────────────────────────────── */}
        <View style={styles.emergencyCard}>
          <View style={styles.emergencyCardHeader}>
            <View style={styles.emergencyBadge}>
              <View style={styles.emergencyDot} />
              <Text style={styles.emergencyBadgeText}>EMERGENCY & URGENT CARE</Text>
            </View>
            <View style={styles.emergencyIconWrap}>
              <Ionicons name="call" size={16} color={colors.alertRed} />
            </View>
          </View>

          <Text style={styles.emergencyTitle}>Need Immediate Pet Care?</Text>
          <Text style={styles.emergencyDesc}>
            In critical situations (breathing distress, trauma, poisoning), call us immediately so our clinic team can prep the treatment room.
          </Text>

          <TouchableOpacity
            style={styles.emergencyCallBtn}
            activeOpacity={0.85}
            onPress={() => setCallModalVisible(true)}
            accessibilityLabel="Call Clinic"
          >
            <Ionicons name="call" size={16} color={colors.white} />
            <Text style={styles.emergencyCallBtnText}>Call Clinic</Text>
          </TouchableOpacity>
        </View>

        {/* ── 4. Upcoming Appointments ──────────────────────────────────── */}
        <View style={styles.section}>

          {/* Section header */}
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionBar, { backgroundColor: colors.primary }]} />
            <Text style={styles.sectionTitle}>Upcoming Appointments</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Bookings')}
              accessibilityLabel="See all appointments"
            >
              <Text style={styles.seeAllLink}>See all</Text>
            </TouchableOpacity>
          </View>

          {/* Appointment cards OR empty state */}
          {upcomingAppointments.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="calendar-outline" size={32} color={colors.borderDashed} />
              <Text style={styles.emptyTitle}>No upcoming appointments</Text>
              <Text style={styles.emptySubtitle}>
                Schedule a visit to keep your pet healthy.
              </Text>
              <TouchableOpacity
                style={styles.emptyActionBtn}
                onPress={() => navigation.navigate('BookAppointment')}
              >
                <Text style={styles.emptyActionText}>Book Now</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.white} />
              </TouchableOpacity>
            </View>
          ) : (
            upcomingAppointments.slice(0, 3).map((appt) => {
              const { bg, text: textColor, dot: dotColor, label: badgeLabel } = statusStyle(appt.status);
              const pet = appt.pet ?? {};
              return (
                <TouchableOpacity
                  key={appt.id}
                  style={styles.appointmentCard}
                  activeOpacity={0.88}
                  onPress={() => navigation.navigate('Bookings')}
                  accessibilityLabel={`View appointment for ${pet.name ?? 'pet'}`}
                >
                  <View style={styles.apptCardMain}>
                    {/* Pet avatar / species icon */}
                    {pet.avatar_url ? (
                      <Image source={{ uri: pet.avatar_url }} style={styles.apptPetAvatarImage} />
                    ) : (
                      <View style={styles.apptPetAvatar}>
                        <Ionicons
                          name={pet.species?.toLowerCase() === 'cat' ? 'logo-octocat' : 'paw'}
                          size={18}
                          color={colors.primary}
                        />
                      </View>
                    )}

                    {/* Details */}
                    <View style={styles.apptDetails}>
                      <View style={styles.apptTitleRow}>
                        <Text style={styles.apptPetName} numberOfLines={1}>
                          {pet.name ?? 'Pet'}
                        </Text>
                        {pet.species ? (
                          <Text style={styles.apptPetSpecies} numberOfLines={1}>
                            · {pet.species}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.apptMetaRow}>
                        <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                        <Text style={styles.apptMeta} numberOfLines={1}>
                          {appt.branch ?? appt.clinic ?? 'BK Petaholic Animal Clinic'}
                        </Text>
                      </View>
                      <View style={styles.apptMetaRow}>
                        <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
                        <Text style={styles.apptMeta} numberOfLines={1}>
                          {formatAppointmentDateTime(appt.appointment_date ?? appt.scheduled_at, appt.appointment_time)}
                        </Text>
                      </View>
                    </View>

                    {/* Status badge */}
                    <View style={[styles.statusBadge, { backgroundColor: bg }]}>
                      {dotColor ? (
                        <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
                      ) : null}
                      <Text style={[styles.statusText, { color: textColor }]}>
                        {badgeLabel ?? appt.status ?? 'Pending'}
                      </Text>
                    </View>
                  </View>

                  {/* Card Action Footer */}
                  <View style={styles.apptCardFooter}>
                    <View style={styles.apptManageLink}>
                      <Text style={styles.apptManageText}>View in Bookings</Text>
                      <Ionicons name="arrow-forward" size={13} color={colors.primary} />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* ── 5. Our Clinics & Hours ────────────────────────────────────── */}
        <View style={styles.section}>

          {/* Section header */}
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionBar, { backgroundColor: colors.primary }]} />
            <Text style={styles.sectionTitle}>Our Clinics & Hours</Text>
          </View>

          {/* Clinic card */}
          <View style={styles.clinicCard}>
            {/* Clinic name + Open badge */}
            <View style={styles.clinicNameRow}>
              <View style={styles.clinicHeaderLeft}>
                {clinic.logo_url && !logoLoadError ? (
                  <Image
                    source={{ uri: clinic.logo_url }}
                    style={styles.clinicLogoImage}
                    resizeMode="cover"
                    onError={() => setLogoLoadError(true)}
                  />
                ) : (
                  <View style={styles.clinicPawBadge}>
                    <Ionicons name="paw" size={16} color={colors.primary} />
                  </View>
                )}
                <View style={styles.clinicHeaderTextWrap}>
                  <Text style={styles.clinicName}>{clinic.name || 'BK Petaholic Animal Clinic'}</Text>
                  <Text style={styles.clinicSubtitle}>{clinic.tagline || 'Compassionate Care for Batangas Pets'}</Text>
                </View>
              </View>
              <View style={styles.openBadge}>
                <View style={styles.openDot} />
                <Text style={styles.openText}>Open Now</Text>
              </View>
            </View>

            {/* Divider */}
            <View style={styles.clinicDivider} />

            {/* Branches List */}
            {branches.map((branch, index) => (
              <View
                key={branch.id}
                style={[
                  styles.branchItem,
                  index > 0 && styles.branchItemBordered,
                ]}
              >
                <View style={styles.branchHeaderRow}>
                  <View style={styles.branchTitleWrap}>
                    <Ionicons name="location" size={15} color={colors.primary} />
                    <Text style={styles.branchName}>{branch.name}</Text>
                  </View>
                </View>

                <Text style={styles.branchAddress}>{branch.address}</Text>

                <View style={styles.branchHoursWrap}>
                  <View style={styles.branchHoursRow}>
                    <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.branchHoursText}>{branch.hoursWeekday}</Text>
                  </View>
                  <View style={styles.branchHoursRow}>
                    <Ionicons name="time-outline" size={12} color={colors.amber} />
                    <Text style={styles.branchHoursText}>{branch.hoursSunday}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── Logout (temp, until bottom tabs have profile) ─────────────── */}
        <TouchableOpacity style={styles.logoutRow} onPress={logout}>
          <Ionicons name="log-out-outline" size={16} color={colors.textMuted} />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* ── Notifications Modal ────────────────────────────────────────── */}
      <Modal
        visible={notifModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNotifModalVisible(false)}
      >
        <View style={styles.notifOverlay}>
          <View style={styles.notifCard}>
            {/* Header */}
            <View style={styles.notifHeader}>
              <View style={styles.notifHeaderLeft}>
                <Ionicons name="notifications" size={20} color={colors.primary} />
                <Text style={styles.notifTitle}>Notifications</Text>
                {unreadCount > 0 ? (
                  <View style={styles.notifUnreadBadge}>
                    <Text style={styles.notifUnreadBadgeText}>{unreadCount}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.notifHeaderRight}>
                {unreadCount > 0 ? (
                  <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn}>
                    <Text style={styles.markAllText}>Mark all as read</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity onPress={() => setNotifModalVisible(false)} style={styles.closeNotifBtn}>
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* List */}
            {loadingNotifs ? (
              <View style={styles.notifLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : notifications.length === 0 ? (
              <View style={styles.notifEmpty}>
                <Ionicons name="notifications-off-outline" size={44} color={colors.borderDashed} />
                <Text style={styles.notifEmptyTitle}>No notifications yet</Text>
                <Text style={styles.notifEmptySub}>We'll notify you when your appointments update.</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.notifList}>
                {notifications.map((item) => {
                  const isUnread = !item.read_at;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.notifItem, isUnread && styles.notifItemUnread]}
                      activeOpacity={0.8}
                      onPress={() => isUnread && handleMarkOneRead(item.id)}
                    >
                      <View style={styles.notifIconWrap}>
                        <Ionicons
                          name={
                            item.type?.includes('approved')
                              ? 'checkmark-circle-outline'
                              : item.type?.includes('cancelled')
                              ? 'close-circle-outline'
                              : item.type?.includes('rescheduled')
                              ? 'time-outline'
                              : 'calendar-outline'
                          }
                          size={20}
                          color={
                            item.type?.includes('approved')
                              ? colors.primary
                              : item.type?.includes('cancelled')
                              ? colors.alertRed
                              : colors.amber
                          }
                        />
                      </View>
                      <View style={styles.notifContent}>
                        <View style={styles.notifItemHeader}>
                          <Text style={[styles.notifItemTitle, isUnread && styles.notifItemTitleBold]}>
                            {item.title}
                          </Text>
                          <Text style={styles.notifItemTime}>{formatRelativeTime(item.created_at)}</Text>
                        </View>
                        <Text style={styles.notifItemMsg}>{item.message}</Text>
                      </View>
                      {isUnread ? <View style={styles.unreadDot} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Interactive Branch Phone Call Modal ──────────────────────── */}
      <Modal
        visible={callModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCallModalVisible(false)}
      >
        <View style={styles.callModalOverlay}>
          <View style={styles.callModalCard}>
            {/* Header */}
            <View style={styles.callModalHeader}>
              <View style={styles.callModalHeaderLeft}>
                <View style={styles.callModalIconCircle}>
                  <Ionicons name="call" size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.callModalTitle}>Contact BK Petaholic</Text>
                  <Text style={styles.callModalSubtitle}>
                    Select a branch to open phone dialer
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setCallModalVisible(false)}
                style={styles.callModalCloseBtn}
                accessibilityLabel="Close call modal"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Branch Options */}
            <View style={styles.callOptionsList}>
              {branches.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={styles.callOptionCard}
                  activeOpacity={0.82}
                  onPress={() => {
                    setCallModalVisible(false);
                    handleDialBranch(b);
                  }}
                  accessibilityLabel={`Call ${b.name} at ${b.phone}`}
                >
                  <View style={styles.callOptionContent}>
                    <View style={styles.callOptionTitleRow}>
                      <Ionicons name="location" size={15} color={colors.primary} />
                      <Text style={styles.callOptionBranchName}>{b.name}</Text>
                    </View>
                    <Text style={styles.callOptionAddress}>{b.addressSummary}</Text>
                    <View style={styles.callOptionPhoneRow}>
                      <Ionicons name="call-outline" size={13} color={colors.primary} />
                      <Text style={styles.callOptionPhoneText}>{b.phone}</Text>
                    </View>
                  </View>
                  <View style={styles.callDialIconWrap}>
                    <Ionicons name="call" size={16} color={colors.white} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Emergency note */}
            <View style={styles.callModalNoteRow}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.alertRed} />
              <Text style={styles.callModalNoteText}>
                For critical emergencies, please call ahead so our staff can prepare triage.
              </Text>
            </View>

            {/* Cancel Button */}
            <TouchableOpacity
              style={styles.callModalCancelBtn}
              activeOpacity={0.85}
              onPress={() => setCallModalVisible(false)}
              accessibilityLabel="Cancel"
            >
              <Text style={styles.callModalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({

  safeArea: {
    flex: 1,
    backgroundColor: colors.background,   // #FAF6F0
  },

  // ── Top App Bar ───────────────────────────────────────────────────────────
  appBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  appBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pawBadge: {
    width: 34,
    height: 34,
    borderRadius: 9999,
    backgroundColor: colors.primaryLight,  // #78A886
    justifyContent: 'center',
    alignItems: 'center',
  },
  wordmark: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.xxl,              // 20 px
    color: colors.primary,               // #4A7C59
    letterSpacing: 0.3,
  },
  appBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bellWrapper: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.alertRed,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  bellBadgeText: {
    color: colors.white,
    fontSize: 9,
    fontFamily: fonts.bodyBold,
    textAlign: 'center',
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 9999,
    backgroundColor: colors.primaryPale,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.primaryLight,
  },
  avatarInitial: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.md,
    color: colors.primary,
  },

  // ── ScrollView ────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xxxl,
    gap: spacing.xl,                      // 24 px between every section
  },

  // ── 2. Greeting Section ───────────────────────────────────────────────────
  greetingSection: {
    gap: spacing.xs,
  },
  greetingLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body,             // 12 px
    color: colors.amber,                  // #705C30
    letterSpacing: 1.0,
  },
  greetingHeading: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.display,          // 24 px
    color: colors.textPrimary,            // #2E3230
  },
  greetingSubtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body,             // 12 px
    color: colors.textTertiary,           // #4A4E4A
    lineHeight: 18,
  },

  // ── 3. Quick Actions Grid ─────────────────────────────────────────────────
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickCard: {
    // Each card is ~half the row width minus the gap
    width: '48.5%',
    height: 70,
    backgroundColor: colors.cardWarm,     // #F5F1EA
    borderRadius: radii.lg,               // 16 px
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  quickCardPrimary: {
    backgroundColor: colors.primary,      // #4A7C59
    borderColor: 'transparent',
  },
  quickIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 9999,
    backgroundColor: colors.primaryPale,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  quickIconCirclePrimary: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  quickIconCircleRed: {
    backgroundColor: colors.alertRedLight,
  },
  quickCardText: {
    flex: 1,
    gap: 2,
  },
  quickCardTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,              // 11 px
    color: colors.textPrimary,
  },
  quickCardTitleWhite: {
    color: colors.white,
  },
  quickCardSub: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,              // 10 px
    color: colors.textSecondary,
  },
  quickCardSubWhite: {
    color: 'rgba(255,255,255,0.75)',
  },

  // ── Section wrapper + header ───────────────────────────────────────────────
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionBar: {
    width: 3,
    height: 18,
    borderRadius: 9999,
  },
  sectionTitle: {
    flex: 1,
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.xl,              // 18 px
    color: colors.textPrimary,
  },
  seeAllLink: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.primary,
  },

  // ── Empty state card ──────────────────────────────────────────────────────
  emptyCard: {
    backgroundColor: colors.cardWarm,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyActionBtn: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: 9999,
  },
  emptyActionText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.white,
  },

  // ── Appointment card ──────────────────────────────────────────────────────
  appointmentCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.base,
    gap: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  apptCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  apptPetAvatar: {
    width: 44,
    height: 44,
    borderRadius: 9999,
    backgroundColor: colors.primaryPale,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  apptPetAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 9999,
    backgroundColor: colors.primaryPale,
    flexShrink: 0,
  },
  apptDetails: {
    flex: 1,
    gap: 3,
  },
  apptTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  apptPetName: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  apptPetSpecies: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  apptMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  apptMeta: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: 9999,
    gap: 4,
    flexShrink: 0,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs,
  },
  apptCardFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.xs + 2,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  apptManageLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  apptManageText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs,
    color: colors.primary,
  },

  // ── Emergency Card ─────────────────────────────────────────────────────────
  emergencyCard: {
    backgroundColor: colors.cardWarm,     // #F5F1EA
    borderRadius: radii.xl,               // 24 px
    padding: spacing.base,
    borderWidth: 1,
    borderColor: 'rgba(184, 50, 48, 0.15)',
    ...shadows.soft,
  },
  emergencyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  emergencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.alertRedLight,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
  },
  emergencyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.alertRed,
  },
  emergencyBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.alertRedDark,
    letterSpacing: 0.4,
  },
  emergencyIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.alertRedLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emergencyTitle: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.lg,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  emergencyDesc: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  emergencyCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    ...shadows.soft,
  },
  emergencyCallBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: colors.white,
  },

  // ── Clinic card ───────────────────────────────────────────────────────────
  clinicCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,               // 24 px
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  clinicNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  clinicHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    marginRight: spacing.xs,
  },
  clinicPawBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryPale,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clinicLogoImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  clinicHeaderTextWrap: {
    flex: 1,
  },
  clinicName: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  clinicSubtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
  openBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryPale,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: 9999,
  },
  openDot: {
    width: 6,
    height: 6,
    borderRadius: 9999,
    backgroundColor: colors.primary,
  },
  openText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs,
    color: colors.primaryDeep,
  },
  clinicDivider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.sm,
  },
  branchItem: {
    paddingVertical: spacing.xs,
  },
  branchItemBordered: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
  },
  branchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  branchTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  branchName: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.sm + 2,
    color: colors.textPrimary,
  },
  branchAddress: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginBottom: 6,
    marginLeft: 21,
  },
  branchHoursWrap: {
    gap: 2,
    marginLeft: 21,
  },
  branchHoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  branchHoursText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    lineHeight: 16,
  },
  callBranchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    backgroundColor: colors.primaryPale,
    flexShrink: 0,
  },
  callBranchBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs,
    color: colors.primary,
  },

  // ── Logout row ────────────────────────────────────────────────────────────
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.base,
  },
  logoutText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },

  // ── Notification Modal Styles ─────────────────────────────────────────────
  notifOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.base,
  },
  notifCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '80%',
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.lg,
    ...shadows.elevated,
  },
  notifHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  notifHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  notifTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.lg,
    color: colors.textPrimary,
  },
  notifUnreadBadge: {
    backgroundColor: colors.alertRed,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  notifUnreadBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.white,
  },
  notifHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  markAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  markAllText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.primary,
  },
  closeNotifBtn: {
    padding: 4,
  },
  notifLoading: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  notifEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  notifEmptyTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  notifEmptySub: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  notifList: {
    paddingVertical: spacing.sm,
  },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.sm,
  },
  notifItemUnread: {
    backgroundColor: '#F7FAF7',
  },
  notifIconWrap: {
    marginTop: 2,
  },
  notifContent: {
    flex: 1,
    gap: 2,
  },
  notifItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notifItemTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
  },
  notifItemTitleBold: {
    fontFamily: fonts.bodyBold,
    color: colors.primaryDeep,
  },
  notifItemTime: {
    fontFamily: fonts.bodyRegular,
    fontSize: 10,
    color: colors.textTertiary,
  },
  notifItemMsg: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6,
  },

  // ── Branch Phone Call Modal Styles ─────────────────────────────────────────
  callModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.base,
  },
  callModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.background,   // #FAF6F0
    borderRadius: radii.xl,               // 24 px
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  callModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  callModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  callModalIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryPale,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callModalTitle: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.lg,
    color: colors.textPrimary,
  },
  callModalSubtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
  callModalCloseBtn: {
    padding: 4,
  },
  callOptionsList: {
    marginVertical: spacing.md,
    gap: spacing.sm,
  },
  callOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardWarm,     // #F5F1EA
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  callOptionContent: {
    flex: 1,
    gap: 2,
  },
  callOptionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  callOptionBranchName: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  callOptionAddress: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginLeft: 21,
  },
  callOptionPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 21,
    marginTop: 2,
  },
  callOptionPhoneText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.primaryDeep,
  },
  callDialIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  callModalNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.alertRedLight,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    marginBottom: spacing.md,
  },
  callModalNoteText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.alertRedDark,
    flex: 1,
    lineHeight: 16,
  },
  callModalCancelBtn: {
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.cardWarm,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callModalCancelText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
});

export default HomeScreen;
