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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, fontSizes, spacing, radii, shadows, statusColors } from '../theme';
import api from '../services/api';
import ThemedDialog from '../components/ThemedDialog';
import TimeWindowPicker from '../components/TimeWindowPicker';
import { useNotification } from '../contexts/NotificationContext';
import { generateTimeSlots } from '../utils/timeSlots';

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

const BRANCH_SHORT_LABELS = {
  'All Branches': 'All Branches',
  'Mabini Branch': 'Mabini',
  'Batangas City Branch': 'Batangas',
};

const STATUS_LABELS = {
  pending: 'Pending Review',
  approved: 'Approved',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const CANCELLATION_REASONS = [
  'Schedule conflict',
  'Pet feeling better / already treated',
  'Financial reasons',
  "Emergency / Can't make it",
  'Other reason',
];

const parseTimeToMinutes = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw || raw.toUpperCase() === 'ON_CALL') return null;
  const ampm = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i.exec(raw);
  if (ampm) {
    let h = Number(ampm[1]) % 12;
    if (ampm[3].toUpperCase() === 'PM') h += 12;
    return h * 60 + Number(ampm[2]);
  }
  const hm = /^\s*(\d{1,2}):(\d{2})/.exec(raw);
  if (!hm) return null;
  return Number(hm[1]) * 60 + Number(hm[2]);
};

const pad = (n) => String(n).padStart(2, '0');
const toDateString = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const getNextDays = (count = 14) => {
  const days = [];
  const start = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i + 1);
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

/** '14:30' | '14:30:00' | '2:30 PM' | 'ON_CALL' → '2:30 PM' */
const formatTime = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Time TBD';
  if (raw.toUpperCase() === 'ON_CALL') return 'On-Call (Staff Schedules)';
  if (/(?:am|pm)\s*$/i.test(raw)) return raw;
  const [h, m] = raw.split(':').map(Number);
  if (Number.isNaN(h)) return 'Time TBD';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, '0')} ${suffix}`;
};

const bookingRef = (id) => `VB-${String(id ?? 0).padStart(6, '0')}`;

const formatPetAge = (pet) => {
  if (!pet) return null;
  const yrs = pet.age != null ? Number(pet.age) : null;
  const mos = pet.age_months != null ? Number(pet.age_months) : null;
  if ((yrs === null || yrs === 0) && mos && mos > 0) {
    return `${mos} ${mos === 1 ? 'mo' : 'mos'}`;
  }
  if (yrs !== null && !Number.isNaN(yrs)) {
    if (yrs > 0 && mos && mos > 0) return `${yrs}y ${mos}m`;
    return `${yrs} ${yrs === 1 ? 'yr' : 'yrs'}`;
  }
  return null;
};

const getBranchStreetHint = (branch) => {
  const b = String(branch ?? '').toLowerCase();
  if (b.includes('mabini')) return ' • 142 Mabini St.';
  if (b.includes('batangas')) return ' • Kumintang Ilaya';
  return '';
};

const getTicketBranchAddress = (branch) => {
  const b = String(branch ?? '').toLowerCase();
  if (b.includes('mabini')) return '142 Mabini St., Poblacion';
  if (b.includes('batangas')) return 'N.F. Almario Building, Kumintang Ilaya';
  return 'VetBook Animal Clinic';
};

const formatTicketFullDate = (value) => {
  const d = parseLocalDate(value);
  return d
    ? d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Date TBD';
};

const sortKey = (a) =>
  `${String(a.appointment_date ?? '').slice(0, 10)} ${String(a.appointment_time ?? '').slice(0, 5)}`;

/** Status → { bg, text, dot } from the theme (falls back to the neutral 'completed' style). */
const getStatusColor = (status) => statusColors[normStatus(status)] ?? statusColors.completed;

const extractCancelReason = (notes) => {
  const raw = String(notes ?? '').trim();
  if (!raw) return 'Clinic schedule adjustment';

  const adminMatch = /\[Cancelled\][ \t]*([^\r\n]+)/i.exec(raw);
  if (adminMatch?.[1]?.trim()) {
    return adminMatch[1].trim();
  }

  const ownerMatch = /\[Cancelled by Pet Owner\][ \t]*(?:Reason:[ \t]*)?([^\r\n]+)/i.exec(raw);
  if (ownerMatch?.[1]?.trim()) {
    return ownerMatch[1].trim();
  }

  return 'Clinic schedule adjustment';
};

const DEFAULT_BRANCH_HOURS = {
  weekday_open: '09:00',
  weekday_close: '18:00',
  saturday_open: '09:00',
  saturday_close: '18:00',
  saturday_closed: false,
  sunday_open: '10:00',
  sunday_close: '16:00',
  sunday_closed: false,
};

const findBranchMatch = (branches, branchName) => {
  const target = String(branchName ?? '').trim().toLowerCase();
  if (!target || !Array.isArray(branches) || branches.length === 0) {
    return DEFAULT_BRANCH_HOURS;
  }

  const matched = branches.find((b) => {
    const name = String(b?.name ?? '').trim().toLowerCase();
    const id = String(b?.id ?? '').trim().toLowerCase();
    if (name === target || id === target) return true;
    if (name && (name.includes(target) || target.includes(name))) return true;
    if (target.includes('mabini') && name.includes('mabini')) return true;
    if (target.includes('batangas') && name.includes('batangas')) return true;
    return false;
  });

  return matched || DEFAULT_BRANCH_HOURS;
};

// ─── On-Call Surgery Proposal Banner ─────────────────────────────────────────

const SurgeryProposalBanner = ({ appt, busy, onRespond }) => {
  if (!appt || appt.surgery_status !== 'slot_proposed') return null;
  const proposedDate = appt.proposed_date || appt.appointment_date;
  const proposedTime = appt.proposed_time || appt.appointment_time;

  return (
    <View style={styles.surgeryProposalBanner}>
      <View style={styles.bannerHeaderRow}>
        <Ionicons name="pulse-outline" size={16} color="#1D4ED8" />
        <Text style={styles.surgeryProposalTitle}>Clinic Staff Proposed a Surgery Schedule</Text>
      </View>
      <Text style={styles.surgeryProposalSub}>
        Proposed slot: {formatDate(proposedDate)} • {formatTime(proposedTime)}
      </Text>
      <View style={styles.bannerBtnsRow}>
        <TouchableOpacity
          style={styles.bannerPrimaryBtn}
          disabled={busy}
          activeOpacity={0.85}
          onPress={() => onRespond?.(appt, 'accept')}
        >
          <Text style={styles.bannerPrimaryBtnText}>Proceed with This Schedule</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bannerSecondaryBtn}
          disabled={busy}
          activeOpacity={0.85}
          onPress={() => onRespond?.(appt, 'request_another')}
        >
          <Text style={styles.bannerSecondaryBtnText}>Ask for Another Time</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── Appointment card ────────────────────────────────────────────────────────

const AppointmentCard = ({
  appt,
  busy,
  actionBusy,
  onView,
  onReschedule,
  onCancel,
  onConfirmAttendance,
  onRespondSurgery,
}) => {
  const status = normStatus(appt.status);
  const sc = getStatusColor(status);
  const isUpcoming = status === 'pending' || status === 'approved';
  const pet = appt.pet ?? {};
  const [petAvatarError, setPetAvatarError] = useState(false);

  const isWithin24Hours = React.useMemo(() => {
    if (!appt.appointment_date) return false;
    const d = parseLocalDate(appt.appointment_date);
    if (!d) return false;
    const diffHours = (d.getTime() - Date.now()) / (1000 * 60 * 60);
    return diffHours <= 36 && diffHours >= -24;
  }, [appt.appointment_date]);

  const needsAttendancePrompt =
    isUpcoming &&
    !appt.attendance_confirmed_at &&
    appt.surgery_status !== 'slot_proposed' &&
    (Boolean(appt.reminder_24h_sent_at) || Boolean(appt.reminder_3h_sent_at) || isWithin24Hours);

  React.useEffect(() => {
    setPetAvatarError(false);
  }, [pet.avatar_url]);

  const speciesAgeLabel = [pet.species, formatPetAge(pet)].filter(Boolean).join(' • ');
  const branchHint = getBranchStreetHint(appt.branch);

  return (
    <View style={styles.card}>
      <View style={[styles.topAccentBar, { backgroundColor: sc.dot }]} />

      <View style={styles.cardBody}>
        {/* Header: pet + status */}
        <View style={styles.cardHeader}>
          {pet.avatar_url && !petAvatarError ? (
            <Image
              source={{ uri: pet.avatar_url }}
              style={styles.petAvatar}
              onError={() => setPetAvatarError(true)}
            />
          ) : (
            <View style={[styles.petAvatar, styles.petAvatarFallback]}>
              <Ionicons name="paw" size={19} color={colors.primary} />
            </View>
          )}
          <View style={styles.petInfo}>
            <Text style={styles.petName} numberOfLines={1}>{pet.name ?? 'Pet'}</Text>
            <View style={styles.metaPillsRow}>
              {!!speciesAgeLabel && (
                <View style={styles.metaPill}>
                  <Text style={styles.metaPillText}>{speciesAgeLabel}</Text>
                </View>
              )}
              <View style={styles.metaPillTicket}>
                <Ionicons name="ticket-outline" size={11} color={colors.textSecondary} />
                <Text style={styles.metaPillText}>{bookingRef(appt.id)}</Text>
              </View>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: sc.dot }]} />
            <Text style={[styles.statusText, { color: sc.text }]}>
              {String(STATUS_LABELS[status] ?? appt.status).toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Warm Info Box */}
        <View style={styles.infoBox}>
          <View style={styles.infoRow}>
            <View style={styles.infoIconCircle}>
              <Ionicons name="location-outline" size={13} color={colors.primary} />
            </View>
            <Text style={styles.infoPrimaryText} numberOfLines={1}>
              {appt.branch ?? 'VetBook Clinic'}
              {!!branchHint && <Text style={styles.infoHintText}>{branchHint}</Text>}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoIconCircle}>
              <Ionicons name="calendar-outline" size={13} color={colors.primary} />
            </View>
            <Text style={styles.infoPrimaryText} numberOfLines={1}>
              {formatDate(appt.appointment_date)}
              <Text style={styles.infoTimeHighlight}> • {formatTime(appt.appointment_time)}</Text>
            </Text>
          </View>
          {!!appt.reason && (
            <View style={styles.infoRow}>
              <View style={styles.infoIconCircle}>
                <Ionicons name="clipboard-outline" size={13} color={colors.primary} />
              </View>
              <Text style={styles.infoReasonText} numberOfLines={1}>
                Reason: <Text style={styles.infoReasonBold}>{appt.reason}</Text>
              </Text>
            </View>
          )}
        </View>

        {isUpcoming && Boolean(appt.attendance_confirmed_at) && (
          <View style={styles.confirmedAttendanceBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#2A6038" />
            <Text style={styles.confirmedAttendanceText}>Confirmed Attendance</Text>
          </View>
        )}

        {isUpcoming && appt.surgery_status === 'awaiting_slot' && (
          <View style={styles.surgeryWaitingBanner}>
            <Ionicons name="time-outline" size={15} color="#705C30" />
            <Text style={styles.surgeryWaitingText}>
              On-Call Surgery Request • Branch staff will propose an available surgical time slot shortly.
            </Text>
          </View>
        )}

        {isUpcoming && (
          <SurgeryProposalBanner appt={appt} busy={actionBusy} onRespond={onRespondSurgery} />
        )}

        {needsAttendancePrompt && (
          <View style={styles.reminderPromptBanner}>
            <View style={styles.bannerHeaderRow}>
              <Ionicons name="notifications-outline" size={16} color="#705C30" />
              <Text style={styles.reminderPromptTitle}>Reminder: Will your appointment still continue?</Text>
            </View>
            <View style={styles.bannerBtnsRow}>
              <TouchableOpacity
                style={styles.bannerPrimaryBtn}
                disabled={actionBusy}
                activeOpacity={0.85}
                onPress={() => onConfirmAttendance?.(appt)}
              >
                <Text style={styles.bannerPrimaryBtnText}>Yes, I'll Continue</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.bannerSecondaryBtn}
                disabled={actionBusy}
                activeOpacity={0.85}
                onPress={() => onReschedule(appt.id)}
              >
                <Text style={styles.bannerSecondaryBtnText}>Cancel / Reschedule</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {status === 'cancelled' && (
          <View style={styles.cancelReasonBanner}>
            <Ionicons name="alert-circle-outline" size={15} color={colors.alertRed} />
            <Text style={styles.cancelReasonText} numberOfLines={2}>
              Cancellation Reason: {extractCancelReason(appt.notes)}
            </Text>
          </View>
        )}

        {/* Actions */}
        {isUpcoming ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.cardActionBtn, styles.btnReschedule]}
              onPress={() => onReschedule(appt.id)}
              disabled={busy}
              activeOpacity={0.8}
            >
              <Text style={styles.btnRescheduleText}>Reschedule</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cardActionBtn, styles.btnCancel]}
              onPress={() => onCancel(appt.id)}
              disabled={busy}
              activeOpacity={0.8}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#C93B3B" />
              ) : (
                <Text style={styles.btnCancelText}>Cancel</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cardActionBtn, styles.btnViewTicket]}
              onPress={() => onView(appt.id)}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Text style={styles.btnViewTicketText}>View Ticket</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.pastViewTicketBtn}
            onPress={() => onView(appt.id)}
            activeOpacity={0.8}
          >
            <Ionicons name="ticket-outline" size={14} color={colors.primary} />
            <Text style={styles.pastViewTicketText}>View Ticket</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// ─── Screen ──────────────────────────────────────────────────────────────────

const MyAppointmentsScreen = ({ navigation }) => {
  const { showNotificationBanner, fetchNotifications, notifications, unreadCount } = useNotification();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('Upcoming / Active');
  const [selectedBranch, setSelectedBranch] = useState('All Branches');
  const [searchQuery, setSearchQuery] = useState('');
  const [cancellingId, setCancellingId] = useState(null);
  const [actionBusyId, setActionBusyId] = useState(null);
  const [branches, setBranches] = useState([]);

  // Surgery Preferred Time Modal state ("Ask for Another Time")
  const [surgeryPrefModalVisible, setSurgeryPrefModalVisible] = useState(false);
  const [surgeryPrefAppt, setSurgeryPrefAppt] = useState(null);
  const [surgeryPrefDate, setSurgeryPrefDate] = useState('');
  const [surgeryPrefFrom, setSurgeryPrefFrom] = useState('9:00 AM');
  const [surgeryPrefTo, setSurgeryPrefTo] = useState('4:00 PM');
  const [surgeryPrefNotes, setSurgeryPrefNotes] = useState('');
  const [submittingSurgeryPref, setSubmittingSurgeryPref] = useState(false);

  // Ticket preview modal state
  const [selectedTicketAppt, setSelectedTicketAppt] = useState(null);
  const [ticketAvatarError, setTicketAvatarError] = useState(false);

  React.useEffect(() => {
    setTicketAvatarError(false);
  }, [selectedTicketAppt?.id, selectedTicketAppt?.pet?.avatar_url]);

  // Reschedule state
  const [rescheduleModalVisible, setRescheduleModalVisible] = useState(false);
  const [reschedulingAppt, setReschedulingAppt] = useState(null);
  const [selectedRescheduleDate, setSelectedRescheduleDate] = useState('');
  const [selectedRescheduleTime, setSelectedRescheduleTime] = useState('');
  const [reschedBookedSlots, setReschedBookedSlots] = useState([]);
  const [submittingReschedule, setSubmittingReschedule] = useState(false);
  const availableDays = getNextDays(14);

  // Fetch already-booked slots whenever reschedule appointment or date changes
  React.useEffect(() => {
    if (!reschedulingAppt?.branch || !selectedRescheduleDate) {
      setReschedBookedSlots([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getBookedSlots(
          reschedulingAppt.branch,
          selectedRescheduleDate,
          reschedulingAppt.service_type || reschedulingAppt.reason
        );
        if (!cancelled) {
          setReschedBookedSlots(res.data?.booked_slots || []);
        }
      } catch {
        if (!cancelled) setReschedBookedSlots([]);
      }
    })();
    return () => { cancelled = true; };
  }, [reschedulingAppt, selectedRescheduleDate]);

  // Dynamic Time Slots based on appointment branch operating hours
  const reschedBranchObj = React.useMemo(() => {
    if (!reschedulingAppt) return null;
    return findBranchMatch(branches, reschedulingAppt.branch);
  }, [branches, reschedulingAppt]);

  const { closed: isReschedClosed, slots: reschedSlots } = React.useMemo(() => {
    return generateTimeSlots(reschedBranchObj, selectedRescheduleDate);
  }, [reschedBranchObj, selectedRescheduleDate]);

  const originalReschedDate = reschedulingAppt?.appointment_date
    ? reschedulingAppt.appointment_date.split('T')[0]
    : '';
  const originalReschedTime = reschedulingAppt?.appointment_time
    ? reschedulingAppt.appointment_time.slice(0, 5)
    : '';

  const isReschedSlotBooked = React.useCallback(
    (slot) =>
      reschedBookedSlots.includes(slot) &&
      !(selectedRescheduleDate === originalReschedDate && slot === originalReschedTime),
    [reschedBookedSlots, selectedRescheduleDate, originalReschedDate, originalReschedTime]
  );

  // Ensure selectedRescheduleTime is valid and not taken by another appointment
  React.useEffect(() => {
    if (reschedSlots.length === 0) {
      setSelectedRescheduleTime('');
      return;
    }
    const currentValid =
      selectedRescheduleTime &&
      reschedSlots.includes(selectedRescheduleTime) &&
      !isReschedSlotBooked(selectedRescheduleTime);
    if (!currentValid) {
      const firstOpen = reschedSlots.find((s) => !isReschedSlotBooked(s)) || '';
      setSelectedRescheduleTime(firstOpen);
    }
  }, [reschedSlots, selectedRescheduleTime, isReschedSlotBooked]);

  // Cancellation reason state
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancellingAppt, setCancellingAppt] = useState(null);
  const [selectedCancelReason, setSelectedCancelReason] = useState('Schedule conflict');
  const [customCancelReason, setCustomCancelReason] = useState('');
  const [submittingCancel, setSubmittingCancel] = useState(false);

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

  const showConfirm = ({
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
    onConfirm,
  }) => {
    setDialog({
      visible: true,
      title,
      message,
      type: destructive ? 'error' : 'confirm',
      confirmText: confirmLabel,
      cancelText: cancelLabel,
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

  const fetchBranches = useCallback(async () => {
    try {
      const res = await api.getBranches();
      const list = res?.data?.data || res?.data || [];
      if (Array.isArray(list) && list.length > 0) {
        setBranches(list);
      }
    } catch (e) {}
  }, []);

  // Refresh whenever the tab is focused and poll every 15s while focused
  useFocusEffect(
    useCallback(() => {
      fetchAppointments();
      fetchBranches();
      const pollId = setInterval(() => {
        fetchAppointments();
      }, 15000);
      return () => clearInterval(pollId);
    }, [fetchAppointments, fetchBranches]),
  );

  // Immediately sync appointment list whenever new notifications / unread count change
  React.useEffect(() => {
    fetchAppointments();
  }, [unreadCount, notifications.length, fetchAppointments]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchAppointments(), fetchBranches()]);
    setRefreshing(false);
  }, [fetchAppointments, fetchBranches]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const getFilteredAppointments = () => {
    const allowed = FILTER_STATUSES[activeFilter] ?? [];
    const q = searchQuery.toLowerCase().trim();
    const now = new Date();
    const localTodayStr = toDateString(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const list = appointments.filter((a) => {
      const st = normStatus(a.status);
      const statusMatch = allowed.includes(st);
      if (!statusMatch) return false;

      // Exclude completed/cancelled/past-ended appointments from Upcoming / Active
      if (activeFilter === 'Upcoming / Active') {
        if (st === 'completed' || st === 'cancelled' || (st !== 'pending' && st !== 'approved')) {
          return false;
        }
        const apptDateStr = String(a.appointment_date ?? '').slice(0, 10);
        if (apptDateStr) {
          if (apptDateStr < localTodayStr) {
            return false;
          }
          if (apptDateStr === localTodayStr) {
            const startMins = parseTimeToMinutes(a.appointment_time);
            if (startMins !== null) {
              const durationMins = Number(a.duration_minutes) || 30;
              if (startMins + durationMins <= nowMinutes) {
                return false;
              }
            }
          }
        }
      }

      // Branch match
      if (selectedBranch !== 'All Branches') {
        const b = (a.branch ?? '').toLowerCase();
        if (selectedBranch === 'Mabini Branch' && !b.includes('mabini')) return false;
        if (selectedBranch === 'Batangas City Branch' && !b.includes('batangas')) return false;
      }

      // Search match (pet name, reason, branch, notes, ticket #)
      if (q.length > 0) {
        const petName = (a.pet?.name ?? '').toLowerCase();
        const reason = (a.reason ?? '').toLowerCase();
        const branch = (a.branch ?? '').toLowerCase();
        const notes = (a.notes ?? '').toLowerCase();
        const ref = bookingRef(a.id).toLowerCase();
        const match =
          petName.includes(q) ||
          reason.includes(q) ||
          branch.includes(q) ||
          notes.includes(q) ||
          ref.includes(q);
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
    setSelectedTicketAppt(a);
  };

  const handleReschedule = (id) => {
    const a = appointments.find((item) => item.id === id);
    if (!a) return;
    setReschedulingAppt(a);
    const currentDate = a.appointment_date ? a.appointment_date.split('T')[0] : availableDays[0].dateStr;
    setSelectedRescheduleDate(currentDate);

    const bObj = findBranchMatch(branches, a.branch);
    if (branches.length === 0) {
      fetchBranches();
    }
    const { slots } = generateTimeSlots(bObj, currentDate);
    const existingTime = a.appointment_time ? a.appointment_time.slice(0, 5) : '';
    if (slots.includes(existingTime)) {
      setSelectedRescheduleTime(existingTime);
    } else {
      setSelectedRescheduleTime(slots[0] || '');
    }
    setReschedBookedSlots([]);
    setRescheduleModalVisible(true);
  };

  const handleConfirmReschedule = async () => {
    if (!reschedulingAppt || !selectedRescheduleDate || !selectedRescheduleTime) {
      showDialog('Incomplete', 'Please select a date and time slot.', 'error');
      return;
    }
    setSubmittingReschedule(true);
    const targetApptId = reschedulingAppt?.id;
    try {
      await api.rescheduleAppointment(reschedulingAppt.id, {
        appointment_date: selectedRescheduleDate,
        appointment_time: selectedRescheduleTime,
      });
      setRescheduleModalVisible(false);
      setReschedulingAppt(null);
      await fetchAppointments();
      showNotificationBanner({
        title: 'Reschedule Request Sent',
        message: 'Please wait for the clinic admin to approve your new schedule.',
        type: 'reschedule',
        appointmentId: targetApptId,
      });
      fetchNotifications(true);
      showDialog(
        'Pending Admin Approval',
        'Your reschedule request has been submitted. Please wait for the clinic admin to approve your new appointment date and time.',
        'info'
      );
    } catch (err) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Could not reschedule appointment.';
      showDialog('Reschedule Failed', msg, 'error');
    } finally {
      setSubmittingReschedule(false);
    }
  };

  const handleCancel = (idOrAppt) => {
    const targetId = typeof idOrAppt === 'object' ? idOrAppt?.id : idOrAppt;
    const appt =
      appointments.find((a) => a.id === targetId) ||
      (typeof idOrAppt === 'object' ? idOrAppt : null);

    if (!appt) return;
    setCancellingAppt(appt);
    setSelectedCancelReason('Schedule conflict');
    setCustomCancelReason('');
    setCancelModalVisible(true);
  };

  const handleConfirmCancel = async () => {
    if (!cancellingAppt) return;

    let finalReason = selectedCancelReason;
    if (selectedCancelReason === 'Other reason') {
      finalReason = customCancelReason.trim() ? customCancelReason.trim() : 'Other reason';
    } else if (customCancelReason.trim()) {
      finalReason = `${selectedCancelReason} — ${customCancelReason.trim()}`;
    }

    setSubmittingCancel(true);
    const targetId = cancellingAppt.id;

    try {
      await api.cancelAppointment(targetId, { cancel_reason: finalReason });
      setCancelModalVisible(false);
      setCancellingAppt(null);
      await fetchAppointments();
      showNotificationBanner({
        title: 'Appointment Cancelled',
        message: 'Your appointment has been cancelled.',
        type: 'cancellation',
        appointmentId: targetId,
      });
      fetchNotifications?.(true);
      showDialog('Cancelled', 'Your appointment has been cancelled.', 'info');
    } catch (err) {
      const msg =
        err?.response?.data?.message ?? err?.message ?? 'Could not cancel the appointment.';
      showDialog('Could not cancel', msg, 'error');
    } finally {
      setSubmittingCancel(false);
    }
  };

  const handleConfirmAttendance = async (appt) => {
    if (!appt?.id || actionBusyId) return;
    setActionBusyId(appt.id);
    try {
      await api.confirmAppointmentAttendance(appt.id);
      await fetchAppointments();
      fetchNotifications?.(true);
      showDialog(
        'Confirmed Attendance',
        'Thank you! Clinic staff has been notified that you will attend this appointment.',
        'info'
      );
    } catch (err) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Could not confirm attendance.';
      showDialog('Notice', msg, 'error');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleRespondSurgery = async (appt, action) => {
    if (!appt?.id || actionBusyId) return;

    if (action === 'request_another') {
      setSelectedTicketAppt(null);
      setSurgeryPrefAppt(appt);
      const defaultDate = availableDays[0]?.dateStr || toDateString(new Date(Date.now() + 86400000));
      setSurgeryPrefDate(defaultDate);
      setSurgeryPrefFrom('9:00 AM');
      setSurgeryPrefTo('4:00 PM');
      setSurgeryPrefNotes('');
      setSurgeryPrefModalVisible(true);
      return;
    }

    setActionBusyId(appt.id);
    try {
      const res = await api.respondToSurgerySlot(appt.id, { action });
      const updated = res?.data?.appointment;
      await fetchAppointments();
      if (updated && selectedTicketAppt?.id === appt.id) {
        setSelectedTicketAppt(updated);
      }
      fetchNotifications?.(true);
      showDialog(
        'Surgery Schedule Confirmed',
        res?.data?.message || 'Your response has been sent to clinic staff.',
        'info'
      );
    } catch (err) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Could not update surgery response.';
      showDialog('Notice', msg, 'error');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleSubmitSurgeryPreference = async () => {
    if (!surgeryPrefAppt?.id || submittingSurgeryPref) return;
    setSubmittingSurgeryPref(true);
    try {
      const res = await api.respondToSurgerySlot(surgeryPrefAppt.id, {
        action: 'request_another',
        preferred_date: surgeryPrefDate,
        preferred_time_from: surgeryPrefFrom,
        preferred_time_to: surgeryPrefTo,
        preferred_notes: surgeryPrefNotes.trim() || undefined,
      });
      setSurgeryPrefModalVisible(false);
      setSurgeryPrefAppt(null);
      await fetchAppointments();
      fetchNotifications?.(true);
      showDialog(
        'Preferred Surgery Schedule Sent',
        res?.data?.message || 'Your new preferred date and time window have been sent to clinic staff.',
        'info'
      );
    } catch (err) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Could not submit preferred surgery schedule.';
      showDialog('Notice', msg, 'error');
    } finally {
      setSubmittingSurgeryPref(false);
    }
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
            <Ionicons name="leaf" size={17} color={colors.white} />
          </View>
          <View style={styles.titleCol}>
            <Text style={styles.title}>My Appointments</Text>
            <Text style={styles.subtitle}>Manage and track your clinic visits</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.bookPillBtn}
          onPress={goBook}
          activeOpacity={0.85}
          accessibilityLabel="Book appointment"
        >
          <Ionicons name="add" size={15} color={colors.primaryDeep} />
          <Text style={styles.bookPillText}>Book</Text>
        </TouchableOpacity>
      </View>

      {/* ── 2. Search Row ──────────────────────────────────────────────── */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={16} color={colors.textTertiary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, Platform.OS === 'web' && { outlineStyle: 'none' }]}
            placeholder="Search pet, reason, or ticket #..."
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

      {/* ── 3-Column Segmented Branch Switcher ────────────────────────────── */}
      <View style={styles.branchSegmentedWrap}>
        {BRANCHES.map((b) => {
          const active = b === selectedBranch;
          return (
            <TouchableOpacity
              key={b}
              style={[styles.branchSegment, active && styles.branchSegmentActive]}
              onPress={() => setSelectedBranch(b)}
              activeOpacity={0.85}
            >
              <Text
                style={[styles.branchSegmentText, active && styles.branchSegmentTextActive]}
                numberOfLines={1}
              >
                {BRANCH_SHORT_LABELS[b] ?? b}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Status Filter tabs ───────────────────────────────────────────── */}
      <View style={styles.filterRowWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = f === activeFilter;
            const tabLabel = active && filtered.length > 0 ? `${f} (${filtered.length})` : f;
            return (
              <TouchableOpacity
                key={f}
                style={[styles.filterTab, active && styles.filterTabActive]}
                onPress={() => setActiveFilter(f)}
                activeOpacity={0.8}
                accessibilityLabel={`${f} appointments`}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{tabLabel}</Text>
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
                  actionBusy={actionBusyId === appt.id}
                  onView={handleView}
                  onReschedule={handleReschedule}
                  onCancel={handleCancel}
                  onConfirmAttendance={handleConfirmAttendance}
                  onRespondSurgery={handleRespondSurgery}
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
          style={styles.modalOverlay}
        >
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

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 24 }}
            >
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
              {isReschedClosed ? (
                <View style={styles.closedCard}>
                  <Ionicons name="calendar-outline" size={20} color="#BA1A1A" />
                  <Text style={styles.closedTitle}>Clinic Closed on this day</Text>
                  <Text style={styles.closedSub}>
                    The clinic is closed on {selectedRescheduleDate}. Please choose another date.
                  </Text>
                </View>
              ) : reschedSlots.length === 0 ? (
                <View style={styles.closedCard}>
                  <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
                  <Text style={styles.closedTitle}>No Slots Available</Text>
                  <Text style={styles.closedSub}>Please choose another date.</Text>
                </View>
              ) : (
                <View style={styles.timeGrid}>
                  {reschedSlots.map((slot) => {
                    const booked = isReschedSlotBooked(slot);
                    const isSel = selectedRescheduleTime === slot && !booked;
                    return (
                      <TouchableOpacity
                        key={slot}
                        style={[
                          styles.timeSlot,
                          isSel && styles.timeSlotActive,
                          booked && styles.timeSlotDisabled,
                        ]}
                        onPress={() => setSelectedRescheduleTime(slot)}
                        disabled={booked}
                        activeOpacity={0.8}
                        accessibilityLabel={`${formatTime(slot)}${booked ? ', booked' : ''}`}
                      >
                        <Text
                          style={[
                            styles.timeSlotText,
                            isSel && styles.timeSlotTextActive,
                            booked && styles.timeSlotTextDisabled,
                          ]}
                        >
                          {formatTime(slot)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
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
                style={[
                  styles.modalSaveBtn,
                  (submittingReschedule || !selectedRescheduleTime) && { opacity: 0.7 },
                ]}
                onPress={handleConfirmReschedule}
                disabled={submittingReschedule || !selectedRescheduleTime}
              >
                {submittingReschedule ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.modalSaveText}>Confirm Reschedule</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Cancellation Reason Modal ─────────────────────────────────────── */}
      <Modal
        visible={cancelModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !submittingCancel && setCancelModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Cancel Appointment</Text>
                <Text style={styles.modalSub}>
                  {cancellingAppt
                    ? `For ${cancellingAppt.pet?.name || 'your pet'} on ${formatDate(cancellingAppt.appointment_date)}`
                    : 'Please tell us why you need to cancel this appointment'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setCancelModalVisible(false)}
                style={styles.modalCloseBtn}
                disabled={submittingCancel}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              {/* Pet / Appointment info badge */}
              {cancellingAppt && (
                <View style={styles.cancelInfoBox}>
                  <Ionicons name="alert-circle-outline" size={18} color={colors.alertRedDark} />
                  <Text style={styles.cancelInfoText}>
                    Cancelling for{' '}
                    <Text style={{ fontFamily: fonts.bodyBold }}>
                      {cancellingAppt.pet?.name || 'your pet'}
                    </Text>{' '}
                    on {formatDate(cancellingAppt.appointment_date)} at{' '}
                    {formatTime(cancellingAppt.appointment_time)}
                  </Text>
                </View>
              )}

              <Text style={styles.modalSectionLabel}>REASON FOR CANCELLATION</Text>
              <View style={styles.reasonsList}>
                {CANCELLATION_REASONS.map((reason) => {
                  const isSel = selectedCancelReason === reason;
                  return (
                    <TouchableOpacity
                      key={reason}
                      style={[styles.reasonItem, isSel && styles.reasonItemActive]}
                      onPress={() => setSelectedCancelReason(reason)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.radioCircle, isSel && styles.radioCircleActive]}>
                        {isSel && <View style={styles.radioInner} />}
                      </View>
                      <Text style={[styles.reasonItemText, isSel && styles.reasonItemTextActive]}>
                        {reason}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Text Input for details / Other */}
              <Text style={[styles.modalSectionLabel, { marginTop: spacing.md }]}>
                {selectedCancelReason === 'Other reason' ? 'PLEASE SPECIFY *' : 'ADDITIONAL DETAILS (OPTIONAL)'}
              </Text>
              <TextInput
                style={styles.reasonTextInput}
                placeholder={
                  selectedCancelReason === 'Other reason'
                    ? 'Please explain why you need to cancel...'
                    : 'Any additional notes for the clinic...'
                }
                placeholderTextColor={colors.textMuted}
                value={customCancelReason}
                onChangeText={setCustomCancelReason}
                multiline
                numberOfLines={3}
                maxLength={300}
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCancelModalVisible(false)}
                disabled={submittingCancel}
              >
                <Text style={styles.modalCancelText}>Keep Appointment</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalCancelDangerBtn,
                  submittingCancel && { opacity: 0.7 },
                  selectedCancelReason === 'Other reason' && !customCancelReason.trim() && { opacity: 0.5 },
                ]}
                onPress={handleConfirmCancel}
                disabled={submittingCancel || (selectedCancelReason === 'Other reason' && !customCancelReason.trim())}
              >
                {submittingCancel ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.modalSaveText}>Confirm Cancellation</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Rich Ticket Card Modal ────────────────────────────────────────── */}
      <Modal
        visible={!!selectedTicketAppt}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedTicketAppt(null)}
      >
        <View style={styles.modalOverlay}>
          {selectedTicketAppt && (() => {
            const ticketStatus = normStatus(selectedTicketAppt.status);
            const ticketSc = getStatusColor(ticketStatus);
            const ticketIsUpcoming = ticketStatus === 'pending' || ticketStatus === 'approved';
            const ticketPet = selectedTicketAppt.pet ?? {};
            const ticketPetMeta = [ticketPet.species, formatPetAge(ticketPet)].filter(Boolean).join(' • ');
            const ticketBranchName = selectedTicketAppt.branch ?? 'VetBook Clinic';
            const ticketBranchAddr = getTicketBranchAddress(ticketBranchName);

            return (
              <View style={styles.ticketModalCard}>
                {/* Top 8px accent bar */}
                <View style={styles.ticketTopAccent} />

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.ticketModalScrollContent}
                >
                  {/* Header row: Ticket pill + Status badge & Close button */}
                  <View style={styles.ticketHeaderRow}>
                    <View style={styles.ticketRefPill}>
                      <Ionicons name="ticket-outline" size={14} color={colors.primaryDeep} />
                      <Text style={styles.ticketRefPillText}>{bookingRef(selectedTicketAppt.id)}</Text>
                    </View>

                    <View style={styles.ticketHeaderRight}>
                      <View style={[styles.statusBadge, { backgroundColor: ticketSc.bg }]}>
                        <View style={[styles.statusDot, { backgroundColor: ticketSc.dot }]} />
                        <Text style={[styles.statusText, { color: ticketSc.text }]}>
                          {String(STATUS_LABELS[ticketStatus] ?? selectedTicketAppt.status).toUpperCase()}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.ticketCloseBtn}
                        onPress={() => setSelectedTicketAppt(null)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel="Close ticket"
                      >
                        <Ionicons name="close" size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Pet profile row */}
                  <View style={styles.ticketPetRow}>
                    {ticketPet.avatar_url && !ticketAvatarError ? (
                      <Image
                        source={{ uri: ticketPet.avatar_url }}
                        style={styles.ticketPetAvatar}
                        onError={() => setTicketAvatarError(true)}
                      />
                    ) : (
                      <View style={[styles.ticketPetAvatar, styles.petAvatarFallback]}>
                        <Ionicons name="paw" size={22} color={colors.primary} />
                      </View>
                    )}
                    <View style={styles.ticketPetInfo}>
                      <Text style={styles.ticketPetName} numberOfLines={1}>
                        {ticketPet.name ?? 'Pet'}
                      </Text>
                      {!!ticketPetMeta && (
                        <View style={[styles.metaPill, styles.ticketPetMetaPill]}>
                          <Text style={styles.metaPillText}>{ticketPetMeta}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Structured Info Rows */}
                  <View style={styles.ticketDetailsList}>
                    <View style={styles.ticketDetailRow}>
                      <View style={styles.ticketDetailIconCircle}>
                        <Ionicons name="location-outline" size={16} color={colors.primary} />
                      </View>
                      <View style={styles.ticketDetailTextWrap}>
                        <Text style={styles.ticketDetailLabel}>CLINIC & BRANCH</Text>
                        <Text style={styles.ticketDetailValue}>{ticketBranchName}</Text>
                        <Text style={styles.ticketDetailSub}>{ticketBranchAddr}</Text>
                      </View>
                    </View>

                    <View style={styles.ticketDetailRow}>
                      <View style={styles.ticketDetailIconCircle}>
                        <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                      </View>
                      <View style={styles.ticketDetailTextWrap}>
                        <Text style={styles.ticketDetailLabel}>DATE & TIME</Text>
                        <Text style={styles.ticketDetailValue}>
                          {formatTicketFullDate(selectedTicketAppt.appointment_date)}
                        </Text>
                        <Text style={styles.ticketDetailSub}>
                          {formatTime(selectedTicketAppt.appointment_time)} (GMT+8)
                        </Text>
                      </View>
                    </View>

                    <View style={styles.ticketDetailRow}>
                      <View style={styles.ticketDetailIconCircle}>
                        <Ionicons name="medkit-outline" size={16} color={colors.primary} />
                      </View>
                      <View style={styles.ticketDetailTextWrap}>
                        <Text style={styles.ticketDetailLabel}>REASON FOR VISIT</Text>
                        <Text style={styles.ticketDetailValue}>
                          {selectedTicketAppt.reason || 'General Visit'}
                        </Text>
                      </View>
                    </View>

                    {ticketIsUpcoming && (
                      <SurgeryProposalBanner
                        appt={selectedTicketAppt}
                        busy={actionBusyId === selectedTicketAppt.id}
                        onRespond={handleRespondSurgery}
                      />
                    )}

                    {ticketStatus === 'cancelled' ? (
                      <View style={styles.cancelReasonBanner}>
                        <Ionicons name="alert-circle-outline" size={15} color={colors.alertRed} />
                        <Text style={styles.cancelReasonText}>
                          Cancellation Reason: {extractCancelReason(selectedTicketAppt.notes)}
                        </Text>
                      </View>
                    ) : !!selectedTicketAppt.notes ? (
                      <View style={styles.ticketDetailRow}>
                        <View style={styles.ticketDetailIconCircle}>
                          <Ionicons name="document-text-outline" size={16} color={colors.primary} />
                        </View>
                        <View style={styles.ticketDetailTextWrap}>
                          <Text style={styles.ticketDetailLabel}>NOTES</Text>
                          <Text style={styles.ticketDetailSub}>{selectedTicketAppt.notes}</Text>
                        </View>
                      </View>
                    ) : null}
                  </View>

                  {/* Footer Buttons */}
                  <View style={styles.ticketFooter}>
                    {ticketIsUpcoming ? (
                      <>
                        <TouchableOpacity
                          style={styles.modalCancelBtn}
                          onPress={() => {
                            const apptId = selectedTicketAppt.id;
                            setSelectedTicketAppt(null);
                            handleReschedule(apptId);
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.modalCancelText}>Reschedule</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.modalSaveBtn}
                          onPress={() => setSelectedTicketAppt(null)}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.modalSaveText}>Done</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity
                        style={styles.ticketDoneFullBtn}
                        onPress={() => setSelectedTicketAppt(null)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.modalSaveText}>Done</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </ScrollView>
              </View>
            );
          })()}
        </View>
      </Modal>

      {/* ── Surgery Preferred Date & Time Window Modal ────────────────────── */}
      <Modal
        visible={surgeryPrefModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !submittingSurgeryPref && setSurgeryPrefModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Request Another Surgery Time</Text>
                <Text style={styles.modalSub}>
                  {surgeryPrefAppt?.pet?.name ?? 'Pet'} • {surgeryPrefAppt?.branch ?? 'Clinic'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => !submittingSurgeryPref && setSurgeryPrefModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              <Text style={styles.modalSectionLabel}>PREFERRED SURGERY DATE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
                {availableDays.map((d) => {
                  const selected = surgeryPrefDate === d.dateStr;
                  return (
                    <TouchableOpacity
                      key={d.dateStr}
                      style={[
                        {
                          width: 58,
                          paddingVertical: 10,
                          borderRadius: 14,
                          borderWidth: 1.5,
                          borderColor: selected ? '#4A7C59' : '#EAE6DE',
                          backgroundColor: selected ? '#4A7C59' : '#FFFFFF',
                          alignItems: 'center',
                        },
                      ]}
                      onPress={() => setSurgeryPrefDate(d.dateStr)}
                    >
                      <Text style={{ fontSize: 11, color: selected ? '#FFFFFF' : '#6B6358', fontFamily: fonts.bodySemiBold }}>
                        {d.dayName}
                      </Text>
                      <Text style={{ fontSize: 16, color: selected ? '#FFFFFF' : '#2E3230', fontFamily: fonts.bodyBold }}>
                        {d.dayNum}
                      </Text>
                      <Text style={{ fontSize: 10, color: selected ? '#FFFFFF' : '#6B6358' }}>
                        {d.monthName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TimeWindowPicker
                title="When would you like your surgery?"
                fromTime={surgeryPrefFrom}
                toTime={surgeryPrefTo}
                onChangeFrom={setSurgeryPrefFrom}
                onChangeTo={setSurgeryPrefTo}
              />

              <Text style={[styles.modalSectionLabel, { marginTop: spacing.md }]}>NOTES (OPTIONAL)</Text>
              <TextInput
                style={{
                  backgroundColor: '#FAF6F0',
                  borderWidth: 1,
                  borderColor: '#D5CFC2',
                  borderRadius: 14,
                  padding: 12,
                  minHeight: 72,
                  color: colors.textPrimary,
                  fontFamily: fonts.bodyRegular,
                  textAlignVertical: 'top',
                }}
                placeholder="Share any preferred details or notes for clinic staff..."
                placeholderTextColor={colors.textTertiary}
                value={surgeryPrefNotes}
                onChangeText={setSurgeryPrefNotes}
                multiline
                maxLength={400}
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                disabled={submittingSurgeryPref}
                onPress={() => setSurgeryPrefModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                disabled={submittingSurgeryPref}
                onPress={handleSubmitSurgeryPreference}
              >
                {submittingSurgeryPref ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.modalSaveText}>Send Preference</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginRight: spacing.sm },
  leafBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: { flex: 1 },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.xxl,
    color: colors.textPrimary,
  },
  subtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs + 1,
    color: colors.textTertiary,
    marginTop: 1,
  },
  bookPillBtn: {
    backgroundColor: colors.primaryPale,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bookPillText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs + 1,
    color: colors.primaryDeep,
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
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E6E0D4',
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

  // 3-Column Segmented Branch Switcher
  branchSegmentedWrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: '#EDE7DC',
    borderRadius: radii.md,
    padding: 4,
    flexDirection: 'row',
  },
  branchSegment: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  branchSegmentActive: {
    backgroundColor: colors.white,
    ...shadows.soft,
  },
  branchSegmentText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs + 1,
    color: colors.textSecondary,
  },
  branchSegmentTextActive: {
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
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#E5DFD3',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  filterTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.body,
    color: colors.textSecondary,
  },
  filterTextActive: {
    fontFamily: fonts.bodyBold,
    color: colors.white,
  },

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
    flexDirection: 'column',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#EAE4D7',
    overflow: 'hidden',
    marginBottom: spacing.base,
    ...shadows.card,
  },
  topAccentBar: { height: 6, width: '100%' },
  cardBody: { padding: spacing.base },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  petAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#CFE2D5',
    backgroundColor: '#E8F1EB',
  },
  petAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F1EB',
  },
  petInfo: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
  petName: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.md + 1,
    color: colors.textPrimary,
  },
  metaPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  metaPill: {
    backgroundColor: '#F5F1E8',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  metaPillTicket: {
    backgroundColor: '#F5F1E8',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaPillText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs + 1,
    color: colors.textSecondary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    flexShrink: 0,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    letterSpacing: 0.3,
  },

  infoBox: {
    backgroundColor: '#FAF7F2',
    borderWidth: 1,
    borderColor: '#EFEAE0',
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 8,
    marginTop: spacing.md,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  infoIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoPrimaryText: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
  },
  infoHintText: {
    fontFamily: fonts.bodyRegular,
    color: colors.textSecondary,
  },
  infoTimeHighlight: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
  },
  infoReasonText: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body,
    color: colors.textSecondary,
  },
  infoReasonBold: {
    fontFamily: fonts.bodyBold,
    color: colors.textPrimary,
  },
  cancelReasonBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: 'rgba(220, 53, 69, 0.25)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  cancelReasonText: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    color: '#C62828',
  },
  confirmedAttendanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#C8E8D0',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  confirmedAttendanceText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: '#2A6038',
  },
  surgeryWaitingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF8E6',
    borderWidth: 1,
    borderColor: '#F3D68D',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  surgeryWaitingText: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: '#705C30',
    lineHeight: 17,
  },
  surgeryProposalBanner: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    gap: 6,
  },
  surgeryProposalTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: '#1E40AF',
    flex: 1,
  },
  surgeryProposalSub: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: '#1E3A8A',
  },
  reminderPromptBanner: {
    backgroundColor: '#FFF8E6',
    borderWidth: 1,
    borderColor: '#F3D68D',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    gap: 8,
  },
  reminderPromptTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: '#705C30',
    flex: 1,
  },
  bannerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bannerBtnsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  bannerPrimaryBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerPrimaryBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.white,
  },
  bannerSecondaryBtn: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#D5CFC2',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerSecondaryBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.textPrimary,
  },

  // Actions
  actions: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  cardActionBtn: {
    flex: 1,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnReschedule: {
    borderWidth: 1,
    borderColor: '#D5CFC2',
    backgroundColor: colors.white,
  },
  btnRescheduleText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
  },
  btnCancel: {
    borderWidth: 1,
    borderColor: '#F2C6C6',
    backgroundColor: '#FFF5F5',
  },
  btnCancelText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.body,
    color: '#C93B3B',
  },
  btnViewTicket: {
    backgroundColor: colors.primary,
  },
  btnViewTicketText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body,
    color: colors.white,
  },
  pastViewTicketBtn: {
    marginTop: spacing.md,
    height: 38,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#D5CFC2',
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pastViewTicketText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body + 1,
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
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    minWidth: '30%',
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
  timeSlotDisabled: {
    opacity: 0.45,
    backgroundColor: colors.cardWarm || '#F5F2EB',
  },
  timeSlotTextDisabled: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  closedCard: {
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: '#FFCDD2',
    borderRadius: radii.md,
    padding: spacing.base,
    alignItems: 'center',
    gap: 4,
    marginVertical: spacing.xs,
  },
  closedTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body,
    color: '#BA1A1A',
  },
  closedSub: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
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

  // Cancellation Reason Modal Styles
  cancelInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFF0F0',
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#FFD4D4',
  },
  cancelInfoText: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.alertRedDark,
  },
  reasonsList: {
    gap: spacing.xs,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.background,
  },
  reasonItemActive: {
    borderColor: colors.primary,
    backgroundColor: '#F0F6F2',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.borderDashed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  reasonItemText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
  },
  reasonItemTextActive: {
    fontFamily: fonts.bodyBold,
    color: colors.primaryDark,
  },
  reasonTextInput: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radii.md,
    padding: spacing.md,
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  modalCancelDangerBtn: {
    flex: 2,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.alertRed,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Rich Ticket Card Modal Styles
  ticketModalCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 420,
    maxHeight: '88%',
    ...shadows.card,
  },
  ticketTopAccent: {
    height: 8,
    width: '100%',
    backgroundColor: colors.primary,
  },
  ticketModalScrollContent: {
    padding: spacing.lg,
  },
  ticketHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  ticketRefPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F5F1E8',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  ticketRefPillText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body,
    color: colors.primaryDeep,
    letterSpacing: 0.4,
  },
  ticketHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ticketCloseBtn: {
    padding: spacing.xs,
  },
  ticketPetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  ticketPetAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#CFE2D5',
    backgroundColor: '#E8F1EB',
  },
  ticketPetInfo: {
    flex: 1,
  },
  ticketPetName: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.lg,
    color: colors.textPrimary,
  },
  ticketPetMetaPill: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  ticketDetailsList: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  ticketDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  ticketDetailIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F5F1E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketDetailTextWrap: {
    flex: 1,
  },
  ticketDetailLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    letterSpacing: 0.6,
  },
  ticketDetailValue: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    marginTop: 2,
  },
  ticketDetailSub: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body,
    color: colors.textSecondary,
    marginTop: 1,
  },
  ticketFooter: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  ticketDoneFullBtn: {
    flex: 1,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MyAppointmentsScreen;
