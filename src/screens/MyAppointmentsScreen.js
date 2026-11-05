/**
 * MyAppointmentsScreen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook — My Appointments (Bookings tab)
 *
 * Sections (top → bottom):
 *  1. Top bar        — leaf icon | "My Appointments" | filter icon
 *  2. Filter tabs    — Upcoming (pending + approved) | Completed | Cancelled
 *  3. Section header — "Upcoming Appointments" / "Past Visits" / "Cancelled"
 *  4. Appointment cards (white, radius 16, coloured left accent bar)
 *       - upcoming: pet, status badge, info box, Reschedule / Cancel / View
 *       - past:     pet, status badge, info box, "View Details" link
 *  5. Empty state    — calendar icon + "No appointments yet" + "Book Now"
 *
 * API:
 *  - api.getUserAppointments() → { appointments: [...] }   (each has .pet)
 *  - api.cancelAppointment(id) → PUT /appointments/{id}/cancel
 *
 * The list is re-fetched every time the tab gains focus so a booking made on
 * another screen shows up immediately (tab screens stay mounted).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, fontSizes, spacing, radii, shadows, statusColors } from '../theme';
import api from '../services/api';
import ThemedDialog from '../components/ThemedDialog';

// ─── Constants ───────────────────────────────────────────────────────────────

const FILTERS = ['All', 'Upcoming / Active', 'Pending', 'Approved', 'Completed', 'Cancelled'];

const FILTER_STATUSES = {
  All: ['pending', 'approved', 'completed', 'cancelled'],
  'Upcoming / Active': ['pending', 'approved'],
  Pending: ['pending'],
  Approved: ['approved'],
  Completed: ['completed'],
  Cancelled: ['cancelled'],
};

const SECTION_TITLES = {
  All: 'All Appointments',
  'Upcoming / Active': 'Upcoming & Active Visits',
  Pending: 'Pending Review',
  Approved: 'Confirmed Appointments',
  Completed: 'Past Visits',
  Cancelled: 'Cancelled',
};

const BRANCHES = ['All Branches', 'Mabini Branch', 'Batangas City Branch'];

const STATUS_LABELS = {
  pending: 'Pending Review',
  approved: 'Approved',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const RESCHEDULE_TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:30',
  '14:00', '14:30', '15:30', '16:00',
];

const pad = (n) => String(n).padStart(2, '0');
const toDateString = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const getNextDays = (count = 14) => {
  const days = [];
  const start = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push({
      dateStr: toDateString(d),
      dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()],
      dayNum: d.getDate(),
      monthName: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()],
    });
  }
  return days;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const normStatus = (s) => String(s ?? '').toLowerCase();

/** Backend sends '2026-10-15T00:00:00.000000Z' (app TZ is UTC) → local Date. */
const parseLocalDate = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

const formatDate = (value) => {
  const d = parseLocalDate(value);
  return d
    ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : 'Date TBD';
};

/** '14:30' | '14:30:00' → '2:30 PM' */
const formatTime = (value) => {
  const [h, m] = String(value ?? '').split(':').map(Number);
  if (Number.isNaN(h)) return 'Time TBD';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, '0')} ${suffix}`;
};

const bookingRef = (id) => `VB-${String(id ?? 0).padStart(6, '0')}`;

const sortKey = (a) =>
  `${String(a.appointment_date ?? '').slice(0, 10)} ${String(a.appointment_time ?? '').slice(0, 5)}`;

/** Status → { bg, text, dot } from the theme (falls back to the neutral 'completed' style). */
const getStatusColor = (status) => statusColors[normStatus(status)] ?? statusColors.completed;

// ─── Appointment card ────────────────────────────────────────────────────────

const AppointmentCard = ({ appt, busy, onView, onReschedule, onCancel }) => {
  const status = normStatus(appt.status);
  const sc = getStatusColor(status);
  const isUpcoming = status === 'pending' || status === 'approved';
  const pet = appt.pet ?? {};

  return (
    <View style={styles.card}>
      <View style={[styles.accent, { backgroundColor: sc.dot }]} />

      <View style={styles.cardBody}>
        {/* Header: pet + status */}
        <View style={styles.cardHeader}>
          {pet.avatar_url ? (
            <Image source={{ uri: pet.avatar_url }} style={styles.petAvatar} />
          ) : (
            <View style={[styles.petAvatar, styles.petAvatarFallback]}>
              <Ionicons name="paw" size={20} color={colors.primary} />
            </View>
          )}
          <View style={styles.petInfo}>
            <Text style={styles.petName} numberOfLines={1}>{pet.name ?? 'Pet'}</Text>
            <Text style={styles.petSub} numberOfLines={1}>
              {[pet.species, bookingRef(appt.id)].filter(Boolean).join(' • ')}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: sc.dot }]} />
            <Text style={[styles.statusText, { color: sc.text }]}>
              {STATUS_LABELS[status] ?? appt.status}
            </Text>
          </View>
        </View>

        {/* Info box */}
        <View style={styles.infoBox}>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={15} color={colors.textSecondary} />
            <Text style={styles.infoText} numberOfLines={1}>{appt.branch ?? 'VetBook Clinic'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={15} color={colors.textSecondary} />
            <Text style={styles.infoText}>
              {formatDate(appt.appointment_date)} • {formatTime(appt.appointment_time)}
            </Text>
          </View>
          {!!appt.reason && (
            <View style={styles.infoRow}>
              <Ionicons name="clipboard-outline" size={15} color={colors.textSecondary} />
              <Text style={styles.infoText} numberOfLines={1}>{appt.reason}</Text>
            </View>
          )}
        </View>

        {/* Actions */}
        {isUpcoming ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnOutline]}
              onPress={() => onReschedule(appt.id)}
              disabled={busy}
              activeOpacity={0.8}
            >
              <Text style={styles.btnOutlineText}>Reschedule</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnDanger]}
              onPress={() => onCancel(appt.id)}
              disabled={busy}
              activeOpacity={0.8}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.alertRed} />
              ) : (
                <Text style={styles.btnDangerText}>Cancel</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => onView(appt.id)}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Text style={styles.btnPrimaryText}>View</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.detailsLink}
            onPress={() => onView(appt.id)}
            activeOpacity={0.7}
          >
            <Text style={styles.detailsLinkText}>View Details</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// ─── Screen ──────────────────────────────────────────────────────────────────

const MyAppointmentsScreen = ({ navigation }) => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('Upcoming / Active');
  const [selectedBranch, setSelectedBranch] = useState('All Branches');
  const [searchQuery, setSearchQuery] = useState('');
  const [cancellingId, setCancellingId] = useState(null);

  // Reschedule state
  const [rescheduleModalVisible, setRescheduleModalVisible] = useState(false);
  const [reschedulingAppt, setReschedulingAppt] = useState(null);
  const [selectedRescheduleDate, setSelectedRescheduleDate] = useState('');
  const [selectedRescheduleTime, setSelectedRescheduleTime] = useState('');
  const [submittingReschedule, setSubmittingReschedule] = useState(false);
  const availableDays = getNextDays(14);

  // Themed dialog state
  const [dialog, setDialog] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    confirmText: 'OK',
    cancelText: 'Cancel',
    onConfirm: null,
    onCancel: null,
    destructive: false,
  });

  const showDialog = (title, message, type = 'info') => {
    setDialog({
      visible: true,
      title,
      message,
      type,
      confirmText: 'OK',
      onConfirm: () => setDialog((prev) => ({ ...prev, visible: false })),
      onCancel: null,
    });
  };

  const showConfirm = ({ title, message, confirmLabel = 'Confirm', destructive = false, onConfirm }) => {
    setDialog({
      visible: true,
      title,
      message,
      type: destructive ? 'error' : 'confirm',
      confirmText: confirmLabel,
      cancelText: 'Cancel',
      destructive,
      onConfirm: () => {
        setDialog((prev) => ({ ...prev, visible: false }));
        onConfirm?.();
      },
      onCancel: () => setDialog((prev) => ({ ...prev, visible: false })),
    });
  };

  const fetchAppointments = useCallback(async () => {
    try {
      const res = await api.getUserAppointments();
      const list = Array.isArray(res?.data?.appointments)
        ? res.data.appointments
        : Array.isArray(res?.data)
        ? res.data
        : [];
      setAppointments(list);
      setError(null);
    } catch (err) {
      console.warn('Could not load appointments:', err?.response?.status ?? err?.message);
      setError('Could not load your appointments. Pull down to try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh whenever the tab is focused (initial load shows the spinner only)
  useFocusEffect(
    useCallback(() => {
      fetchAppointments();
    }, [fetchAppointments]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAppointments();
    setRefreshing(false);
  }, [fetchAppointments]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const getFilteredAppointments = () => {
    const allowed = FILTER_STATUSES[activeFilter] ?? [];
    const q = searchQuery.toLowerCase().trim();

    const list = appointments.filter((a) => {
      // Status match
      const statusMatch = allowed.includes(normStatus(a.status));
      if (!statusMatch) return false;

      // Branch match
      if (selectedBranch !== 'All Branches') {
        const b = (a.branch ?? '').toLowerCase();
        if (selectedBranch === 'Mabini Branch' && !b.includes('mabini')) return false;
        if (selectedBranch === 'Batangas City Branch' && !b.includes('batangas')) return false;
      }

      // Search match (pet name, reason, branch, notes)
      if (q.length > 0) {
        const petName = (a.pet?.name ?? '').toLowerCase();
        const reason = (a.reason ?? '').toLowerCase();
        const branch = (a.branch ?? '').toLowerCase();
        const notes = (a.notes ?? '').toLowerCase();
        const match = petName.includes(q) || reason.includes(q) || branch.includes(q) || notes.includes(q);
        if (!match) return false;
      }

      return true;
    });

    // Upcoming / Pending: soonest first. Others: most recent first.
    const isUpcoming = ['Upcoming / Active', 'Pending', 'Approved'].includes(activeFilter);
    return list.sort((a, b) =>
      isUpcoming
        ? sortKey(a).localeCompare(sortKey(b))
        : sortKey(b).localeCompare(sortKey(a)),
    );
  };

  const filtered = getFilteredAppointments();

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleView = (id) => {
    const a = appointments.find((x) => x.id === id);
    if (!a) return;
    // No dedicated details screen yet — show the booking summary.
    showDialog(
      `Appointment ${bookingRef(a.id)}`,
      [
        `Pet: ${a.pet?.name ?? '-'}`,
        `Status: ${STATUS_LABELS[normStatus(a.status)] ?? a.status}`,
        `Branch: ${a.branch ?? '-'}`,
        `Date: ${formatDate(a.appointment_date)}`,
        `Time: ${formatTime(a.appointment_time)}`,
        `Reason: ${a.reason ?? '-'}`,
        a.notes ? `Notes: ${a.notes}` : null,
      ].filter(Boolean).join('\n'),
      'info'
    );
  };

  const handleReschedule = (id) => {
    const a = appointments.find((item) => item.id === id);
    if (!a) return;
    setReschedulingAppt(a);
    const currentDate = a.appointment_date ? a.appointment_date.split('T')[0] : availableDays[0].dateStr;
    setSelectedRescheduleDate(currentDate);
    setSelectedRescheduleTime(a.appointment_time ? a.appointment_time.slice(0, 5) : '09:00');
    setRescheduleModalVisible(true);
  };

  const handleConfirmReschedule = async () => {
    if (!reschedulingAppt || !selectedRescheduleDate || !selectedRescheduleTime) {
      showDialog('Incomplete', 'Please select a date and time slot.', 'error');
      return;
    }
    setSubmittingReschedule(true);
    try {
      await api.rescheduleAppointment(reschedulingAppt.id, {
        appointment_date: selectedRescheduleDate,
        appointment_time: selectedRescheduleTime,
      });
      setRescheduleModalVisible(false);
      setReschedulingAppt(null);
      await fetchAppointments();
      showDialog('Success', 'Appointment rescheduled successfully.', 'success');
    } catch (err) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Could not reschedule appointment.';
      showDialog('Reschedule Failed', msg, 'error');
    } finally {
      setSubmittingReschedule(false);
    }
  };

  const handleCancel = (id) => {
    showConfirm({
      title: 'Cancel appointment?',
      message: 'This will free up the time slot. This action cannot be undone.',
      confirmLabel: 'Yes, cancel',
      cancelLabel: 'Keep it',
      destructive: true,
      onConfirm: async () => {
        setCancellingId(id);
        try {
          await api.cancelAppointment(id);
          await fetchAppointments();
        } catch (err) {
          const msg =
            err?.response?.data?.message ?? err?.message ?? 'Could not cancel the appointment.';
          showDialog('Could not cancel', msg, 'error');
        } finally {
          setCancellingId(null);
        }
      },
    });
  };

  const goBook = () => navigation.navigate('BookAppointment');

  // ── Render ────────────────────────────────────────────────────────────────

  const renderEmpty = () => {
    const noneAtAll = appointments.length === 0;
    const title = noneAtAll
      ? 'No appointments yet'
      : activeFilter === 'Upcoming'
      ? 'No upcoming appointments'
      : activeFilter === 'Completed'
      ? 'No completed visits yet'
      : 'No cancelled appointments';

    return (
      <View style={styles.emptyCard}>
        <View style={styles.emptyIcon}>
          <Ionicons name="calendar-outline" size={34} color={colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptySub}>
          {noneAtAll || activeFilter === 'Upcoming'
            ? 'Schedule a visit to keep your pet healthy.'
            : 'Appointments will appear here once they match this filter.'}
        </Text>
        {(noneAtAll || activeFilter === 'Upcoming') && (
          <TouchableOpacity style={styles.emptyBtn} onPress={goBook} activeOpacity={0.85}>
            <Text style={styles.emptyBtnText}>Book Now</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.white} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── 1. Top bar ───────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <View style={styles.titleWrap}>
          <View style={styles.leafBadge}>
            <Ionicons name="leaf" size={16} color={colors.white} />
          </View>
          <Text style={styles.title}>My Appointments</Text>
        </View>
      </View>

      {/* ── 2. Search & Branch Row ─────────────────────────────────────── */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={16} color={colors.textTertiary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search pet, reason, branch..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Branch Pills ─────────────────────────────────────────────────── */}
      <View style={styles.branchRowWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.branchScroll}>
          {BRANCHES.map((b) => {
            const active = b === selectedBranch;
            return (
              <TouchableOpacity
                key={b}
                style={[styles.branchPill, active && styles.branchPillActive]}
                onPress={() => setSelectedBranch(b)}
                activeOpacity={0.8}
              >
                <Text style={[styles.branchPillText, active && styles.branchPillTextActive]}>{b}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Status Filter tabs ───────────────────────────────────────────── */}
      <View style={styles.filterRowWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = f === activeFilter;
            return (
              <TouchableOpacity
                key={f}
                style={[styles.filterTab, active && styles.filterTabActive]}
                onPress={() => setActiveFilter(f)}
                activeOpacity={0.8}
                accessibilityLabel={`${f} appointments`}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{f}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── 3-5. List ────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          {!!error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.alertRedDark} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {filtered.length > 0 && (
            <View style={styles.sectionHeader}>
              <View style={styles.sectionBar} />
              <Text style={styles.sectionTitle}>{SECTION_TITLES[activeFilter]}</Text>
              <Text style={styles.sectionCount}>{filtered.length}</Text>
            </View>
          )}

          {filtered.length === 0
            ? renderEmpty()
            : filtered.map((appt) => (
                <AppointmentCard
                  key={appt.id}
                  appt={appt}
                  busy={cancellingId === appt.id}
                  onView={handleView}
                  onReschedule={handleReschedule}
                  onCancel={handleCancel}
                />
              ))}
        </ScrollView>
      )}

      {/* ── Reschedule Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={rescheduleModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRescheduleModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Reschedule Appointment</Text>
                <Text style={styles.modalSub}>
                  {reschedulingAppt?.pet?.name ? `For ${reschedulingAppt.pet.name}` : 'Select a new date & time'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setRescheduleModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Date Selection */}
              <Text style={styles.modalSectionLabel}>CHOOSE NEW DATE</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.daysScroll}
              >
                {availableDays.map((d) => {
                  const isSel = selectedRescheduleDate === d.dateStr;
                  return (
                    <TouchableOpacity
                      key={d.dateStr}
                      style={[styles.dayCard, isSel && styles.dayCardActive]}
                      onPress={() => setSelectedRescheduleDate(d.dateStr)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.dayName, isSel && styles.dayTextActive]}>{d.dayName}</Text>
                      <Text style={[styles.dayNum, isSel && styles.dayTextActive]}>{d.dayNum}</Text>
                      <Text style={[styles.dayMonth, isSel && styles.dayTextActive]}>{d.monthName}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Time Selection */}
              <Text style={[styles.modalSectionLabel, { marginTop: spacing.md }]}>CHOOSE TIME SLOT</Text>
              <View style={styles.timeGrid}>
                {RESCHEDULE_TIME_SLOTS.map((slot) => {
                  const isSel = selectedRescheduleTime === slot;
                  return (
                    <TouchableOpacity
                      key={slot}
                      style={[styles.timeSlot, isSel && styles.timeSlotActive]}
                      onPress={() => setSelectedRescheduleTime(slot)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.timeSlotText, isSel && styles.timeSlotTextActive]}>{slot}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setRescheduleModalVisible(false)}
                disabled={submittingReschedule}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, submittingReschedule && { opacity: 0.7 }]}
                onPress={handleConfirmReschedule}
                disabled={submittingReschedule}
              >
                {submittingReschedule ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.modalSaveText}>Confirm Reschedule</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Themed Custom Dialog / Alert */}
      <ThemedDialog {...dialog} />
    </SafeAreaView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    paddingBottom: spacing.md,
  },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  leafBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.xxl,
    color: colors.textPrimary,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.cardWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.md,
    height: 42,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    paddingVertical: 0,
  },

  // Branch pills
  branchRowWrap: {
    paddingBottom: spacing.xs,
  },
  branchScroll: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  branchPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.cardWarm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  branchPillActive: {
    backgroundColor: colors.primaryPale,
    borderColor: colors.primary,
  },
  branchPillText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
  },
  branchPillTextActive: {
    fontFamily: fonts.bodyBold,
    color: colors.primaryDeep,
  },

  // Filter tabs
  filterRowWrap: {
    paddingBottom: spacing.xs,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  filterTab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.cardWarm,
  },
  filterTabActive: { backgroundColor: colors.primary },
  filterText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  filterTextActive: { color: colors.white },

  // List
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionBar: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginRight: spacing.sm,
  },
  sectionTitle: {
    flex: 1,
    fontFamily: fonts.heading,
    fontSize: fontSizes.lg,
    color: colors.textPrimary,
  },
  sectionCount: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body,
    color: colors.textSecondary,
    backgroundColor: colors.cardWarm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.alertRedLight,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.base,
  },
  errorText: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.body,
    color: colors.alertRedDark,
  },

  // Card
  card: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginBottom: spacing.base,
    ...shadows.card,
  },
  accent: { width: 5 },
  cardBody: { flex: 1, padding: spacing.base },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  petAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.cardWarm,
  },
  petAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryPale,
  },
  petInfo: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
  petName: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.lg,
    color: colors.textPrimary,
  },
  petSub: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body,
    color: colors.textSecondary,
    marginTop: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs + 1,
    letterSpacing: 0.3,
  },

  infoBox: {
    backgroundColor: colors.cardWarm,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  infoText: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.body + 1,
    color: colors.textTertiary,
  },

  // Actions
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  btn: {
    flex: 1,
    height: 38,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutline: { borderWidth: 1, borderColor: colors.borderDashed, backgroundColor: colors.white },
  btnOutlineText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.body + 1,
    color: colors.textPrimary,
  },
  btnDanger: { backgroundColor: colors.alertRedLight },
  btnDangerText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.body + 1,
    color: colors.alertRedDark,
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body + 1,
    color: colors.white,
  },
  detailsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 2,
    marginTop: spacing.md,
  },
  detailsLinkText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: colors.primary,
  },

  // Empty state
  emptyCard: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderDashed,
    padding: spacing.xl,
    marginTop: spacing.sm,
  },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.primaryPale,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  emptyTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.xl,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  emptyBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: colors.white,
  },

  // Modal styles for Reschedule
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    ...shadows.elevated,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  modalTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.lg,
    color: colors.textPrimary,
  },
  modalSub: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: spacing.xs,
  },
  modalSectionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  daysScroll: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  dayCard: {
    width: 60,
    height: 74,
    borderRadius: radii.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dayCardActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayName: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
  },
  dayNum: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.lg,
    color: colors.textPrimary,
  },
  dayMonth: {
    fontFamily: fonts.bodyRegular,
    fontSize: 10,
    color: colors.textSecondary,
  },
  dayTextActive: {
    color: colors.white,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  timeSlot: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    minWidth: '28%',
  },
  timeSlotActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  timeSlotText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
  },
  timeSlotTextActive: {
    color: colors.white,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderDashed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.body,
    color: colors.textSecondary,
  },
  modalSaveBtn: {
    flex: 2,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body,
    color: colors.white,
  },
});

export default MyAppointmentsScreen;
