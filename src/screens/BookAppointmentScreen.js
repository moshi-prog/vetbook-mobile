/**
 * BookAppointmentScreen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook — Book Appointment Screen
 *
 * Sections (top → bottom):
 *  1. Top App Bar      — back | "Book Appointment" | help
 *  2. Progress         — Select Pet → Date → Time → Confirm
 *  3. Select Pet       — horizontal cards (+ Add New Pet first)
 *  4. Select Branch    — two radio-style option cards
 *  5. Choose Date      — month header + horizontal date strip + "See more"
 *  6. Choose Time      — 3-column slot grid
 *  7. Reason for Visit — chips + optional notes (0/200)
 *  8. Sticky bar       — selected pet/branch summary, est. time, Confirm button
 *
 * API:
 *  - api.getUserPets()          → { pets: [...] }
 *  - api.createAppointment(...) → POST /appointments
 *    If the backend route does not exist yet (404), the flow still completes
 *    with a success alert so the UI can be tested end-to-end.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, fontSizes, spacing, radii, shadows } from '../theme';
import api from '../services/api';
import { useNotification } from '../contexts/NotificationContext';
import { generateTimeSlots } from '../utils/timeSlots';

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_BRANCHES = [
  {
    id: 'mabini',
    name: 'Mabini Branch',
    address: '142 Mabini St., Poblacion',
    hoursWeekday: 'Mon–Sat: 9:00 AM – 6:00 PM',
    hoursSunday: 'Sun: 10:00 AM – 4:00 PM',
    weekday_open: '09:00',
    weekday_close: '18:00',
    saturday_open: '09:00',
    saturday_close: '18:00',
    saturday_closed: false,
    sunday_open: '10:00',
    sunday_close: '16:00',
    sunday_closed: false,
  },
  {
    id: 'batangas_city',
    name: 'Batangas City Branch',
    address: 'N.F. Almario Building, Kumintang Ilaya',
    hoursWeekday: 'Mon–Sat: 9:00 AM – 6:00 PM',
    hoursSunday: 'Sun: 10:00 AM – 4:00 PM',
    weekday_open: '09:00',
    weekday_close: '18:00',
    saturday_open: '09:00',
    saturday_close: '18:00',
    saturday_closed: false,
    sunday_open: '10:00',
    sunday_close: '16:00',
    sunday_closed: false,
  },
];

const REASONS = ['Checkup', 'Vaccination', 'Grooming', 'Deworming', 'Emergency'];

const STEPS = ['Select Pet', 'Date', 'Time', 'Confirm'];

const INITIAL_DAYS  = 14;
const MAX_DAYS      = 56;
const DATE_CARD_W   = 56;
const DATE_GAP      = spacing.sm;
const NOTES_MAX     = 200;
const EST_DURATION  = 'Est. 45 min';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const speciesColor = (species = '') => {
  const s = String(species).toLowerCase();
  if (s === 'dog')    return '#4A7C59';
  if (s === 'cat')    return '#705C30';
  if (s === 'bird')   return '#78A886';
  if (s === 'rabbit') return '#B83230';
  return '#6B6358';
};

const pad = (n) => String(n).padStart(2, '0');

/** Local-time YYYY-MM-DD (avoids the UTC shift of toISOString). */
const toDateString = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const isSameDay = (a, b) =>
  !!a && !!b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** '14:30' → '2:30 PM' */
const formatSlot = (slot) => {
  const [h, m] = slot.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad(m)} ${suffix}`;
};

/** Next `count` days starting today. Checks branch Saturday/Sunday status. */
const generateDates = (count, branch) => {
  const today = new Date();
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const dayOfWeek = date.getDay();
    const isSunday = dayOfWeek === 0;
    const isSaturday = dayOfWeek === 6;
    let available = true;
    if (isSunday && branch?.sunday_closed) available = false;
    if (isSaturday && branch?.saturday_closed) available = false;
    return {
      date,
      day: date.toLocaleDateString('en-US', { weekday: 'short' }),
      num: date.getDate(),
      available,
    };
  });
};

const extractList = (data, key) =>
  Array.isArray(data?.[key]) ? data[key] : Array.isArray(data) ? data : [];

const parseTimeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

/** Calculate whether a branch is open now in Philippine Standard Time (Asia/Manila, UTC+8). */
const isBranchOpenNow = (branch, nowUtcMs = Date.now()) => {
  const pht = new Date(nowUtcMs + 8 * 60 * 60 * 1000);
  const day = pht.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const currentMins = pht.getUTCHours() * 60 + pht.getUTCMinutes();

  let openStr;
  let closeStr;
  if (day === 0) {
    if (branch?.sunday_closed) return false;
    openStr = branch?.sunday_open;
    closeStr = branch?.sunday_close;
  } else if (day === 6) {
    if (branch?.saturday_closed) return false;
    openStr = branch?.saturday_open || branch?.weekday_open;
    closeStr = branch?.saturday_close || branch?.weekday_close;
  } else {
    openStr = branch?.weekday_open;
    closeStr = branch?.weekday_close;
  }

  const openMins = parseTimeToMinutes(openStr);
  const closeMins = parseTimeToMinutes(closeStr);
  if (openMins === null || closeMins === null) return false;

  return currentMins >= openMins && currentMins < closeMins;
};

const buildBranchCard = (b, nowUtcMs = Date.now()) => {
  const normalized = {
    id: b.id,
    name: b.name,
    address: b.addressSummary || b.address,
    badge: b.badge ?? null,
    hoursWeekday: b.hoursWeekday || 'Mon–Sat: 9:00 AM – 6:00 PM',
    hoursSunday: b.hoursSunday || 'Sun: 10:00 AM – 4:00 PM',
    weekday_open: b.weekday_open || '09:00',
    weekday_close: b.weekday_close || '18:00',
    saturday_open: b.saturday_open || b.weekday_open || '09:00',
    saturday_close: b.saturday_close || b.weekday_close || '18:00',
    saturday_closed: !!b.saturday_closed,
    sunday_open: b.sunday_open || '10:00',
    sunday_close: b.sunday_close || '16:00',
    sunday_closed: !!b.sunday_closed,
  };
  const open = isBranchOpenNow(normalized, nowUtcMs);
  const phtDay = new Date(nowUtcMs + 8 * 60 * 60 * 1000).getUTCDay();
  const scheduleLabel = phtDay === 0 ? normalized.hoursSunday : normalized.hoursWeekday;

  return {
    ...normalized,
    open,
    footer: `${open ? 'Open now' : 'Closed'} • ${scheduleLabel}`,
  };
};

// ─── Small presentational pieces ─────────────────────────────────────────────

const PetAvatar = ({ pet, size }) => {
  const accent = speciesColor(pet?.species);
  const dim = { width: size, height: size, borderRadius: size / 2 };
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [pet?.avatar_url]);

  if (pet?.avatar_url && !imgError) {
    return (
      <Image
        source={{ uri: pet.avatar_url }}
        style={[dim, { backgroundColor: colors.cardWarm }]}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <View style={[dim, styles.avatarFallback, { backgroundColor: accent + '22', borderColor: accent + '44' }]}>
      <Ionicons name="paw-outline" size={size * 0.45} color={accent} />
    </View>
  );
};

const SectionHeading = ({ title, right }) => (
  <View style={styles.sectionHeadingRow}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {right}
  </View>
);

// ─────────────────────────────────────────────────────────────────────────────

const BookAppointmentScreen = ({ route, navigation }) => {
  const { showNotificationBanner, fetchNotifications } = useNotification();
  // On web, bound the screen to the real window height so the ScrollView scrolls.
  const { height: windowHeight } = useWindowDimensions();
  const { petId: preselectedPetId, pet: preselectedPet } = route?.params || {};

  // ── State ──────────────────────────────────────────────────────────────────
  const [pets, setPets]                     = useState([]);
  const [branches, setBranches]             = useState(() => DEFAULT_BRANCHES.map((b) => buildBranchCard(b)));
  const [selectedPetId, setSelectedPetId]   = useState(preselectedPetId || null);
  const [selectedPet, setSelectedPet]       = useState(preselectedPet || null);
  const [selectedBranch, setSelectedBranch] = useState('Mabini Branch');
  const [selectedDate, setSelectedDate]     = useState(null);
  const [selectedTime, setSelectedTime]     = useState(null);
  const [bookedSlots, setBookedSlots]       = useState([]);
  const [fetchingSlots, setFetchingSlots]   = useState(false);
  const [reason, setReason]                 = useState('Checkup');
  const [notes, setNotes]                   = useState('');
  const [loading, setLoading]               = useState(false);
  const [fetchingPets, setFetchingPets]     = useState(true);

  const [daysCount, setDaysCount]           = useState(INITIAL_DAYS);
  const [visibleDateIdx, setVisibleDateIdx] = useState(0);
  const dateScrollRef = useRef(null);
  const dateScrollX   = useRef(0);

  // ── Fetch branch operating hours & details on mount ────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getBranches();
        if (cancelled) return;
        const branchList = res?.data?.data || res?.data || [];
        if (Array.isArray(branchList) && branchList.length > 0) {
          setBranches(branchList.map((b) => buildBranchCard(b)));
        }
      } catch (err) {
        // Fallback to initial BRANCHES
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch pets on mount ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getUserPets();
        if (cancelled) return;
        let list = extractList(res.data, 'pets');
        // Make sure a preselected pet is always listed
        if (preselectedPet && !list.some((p) => String(p.id) === String(preselectedPet.id))) {
          list = [preselectedPet, ...list];
        }
        setPets(list);
        if (preselectedPetId) {
          const match = list.find((p) => String(p.id) === String(preselectedPetId));
          if (match) {
            setSelectedPetId(match.id);
            setSelectedPet(match);
          }
        }
      } catch (err) {
        console.warn('Could not load pets:', err?.response?.status ?? err.message);
        if (!cancelled && preselectedPet) setPets([preselectedPet]);
      } finally {
        if (!cancelled) setFetchingPets(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived values ─────────────────────────────────────────────────────────
  const branchObj = branches.find((b) => b.name === selectedBranch) || branches[0];

  const dates = generateDates(daysCount, branchObj);

  // Dynamic Time Slots based on branch operating hours
  const { closed: isClinicClosed, slots: availableSlots } = React.useMemo(() => {
    return generateTimeSlots(branchObj, selectedDate);
  }, [branchObj, selectedDate]);

  // ── Fetch live booked slots when branch or date changes ────────────────────
  useEffect(() => {
    if (!selectedBranch || !selectedDate) {
      setBookedSlots([]);
      return;
    }
    let cancelled = false;
    setFetchingSlots(true);
    (async () => {
      try {
        const dateStr = toDateString(selectedDate);
        const res = await api.getBookedSlots(selectedBranch, dateStr);
        if (!cancelled) {
          setBookedSlots(res.data?.booked_slots || []);
        }
      } catch (err) {
        if (!cancelled) setBookedSlots([]);
      } finally {
        if (!cancelled) setFetchingSlots(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedBranch, selectedDate]);

  // Reset selectedTime if it becomes invalid under new operating hours or booked slots
  useEffect(() => {
    if (selectedTime && (!availableSlots.includes(selectedTime) || bookedSlots.includes(selectedTime))) {
      setSelectedTime(null);
    }
  }, [availableSlots, bookedSlots, selectedTime]);

  // Progress: first incomplete step is the "current" one
  const currentStep = !selectedPetId ? 1 : !selectedDate ? 2 : !selectedTime ? 3 : 4;

  const now = new Date();
  const isSlotPast = (slot) => {
    if (!selectedDate || !isSameDay(selectedDate, now)) return false;
    const [h, m] = slot.split(':').map(Number);
    return h * 60 + m <= now.getHours() * 60 + now.getMinutes();
  };

  const headerMonth = (dates[visibleDateIdx]?.date || dates[0].date).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSelectPet = (pet) => {
    if (String(selectedPetId) === String(pet.id)) {
      setSelectedPetId(null);
      setSelectedPet(null);
    } else {
      setSelectedPetId(pet.id);
      setSelectedPet(pet);
    }
  };

  const handleSelectDate = (item) => {
    if (!item.available) return;
    setSelectedDate(item.date);
    // A previously chosen time may be in the past for the new date
    setSelectedTime(null);
  };

  const handleSelectTime = (slot) => setSelectedTime(slot);

  const handleAddNewPet = () => navigation.navigate('AddPet');

  const handleHelp = () =>
    Alert.alert(
      'Booking help',
      'Pick a pet, branch, date and time, then confirm. The clinic will review your request and contact you if anything changes.',
    );

  const scrollDates = (direction) => {
    const step = (DATE_CARD_W + DATE_GAP) * 4;
    const x = Math.max(0, dateScrollX.current + direction * step);
    dateScrollRef.current?.scrollTo({ x, animated: true });
  };

  const handleDateScroll = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    dateScrollX.current = x;
    const idx = Math.min(
      dates.length - 1,
      Math.max(0, Math.round(x / (DATE_CARD_W + DATE_GAP))),
    );
    if (idx !== visibleDateIdx) setVisibleDateIdx(idx);
  };

  const finishBooking = (appointment) => {
    navigation.replace('AppointmentConfirmation', {
      appointment,
      pet: selectedPet,
      branch: selectedBranch,
      date: toDateString(selectedDate),
      time: selectedTime,
      reason,
    });
  };

  const handleSubmit = async () => {
    if (loading) return;

    if (!selectedPetId) {
      Alert.alert('Select a pet', 'Please choose which pet this appointment is for.');
      return;
    }
    if (!selectedDate) {
      Alert.alert('Choose a date', 'Please pick an appointment date.');
      return;
    }
    if (!selectedTime) {
      Alert.alert('Choose a time', 'Please pick an available time slot.');
      return;
    }

    const payload = {
      pet_id: selectedPetId,
      branch: selectedBranch,
      appointment_date: toDateString(selectedDate),
      appointment_time: selectedTime,
      reason,
      notes: notes.trim() || null,
    };

    setLoading(true);
    try {
      const res = await api.createAppointment(payload);
      const appointment = res?.data?.appointment ?? res?.data ?? payload;
      showNotificationBanner({
        title: 'Appointment Booked',
        message: 'Your booking has been received and is pending clinic review.',
        type: 'appointment',
        appointmentId: appointment?.id,
      });
      fetchNotifications(true);
      finishBooking(appointment);
    } catch (err) {
      const data = err?.response?.data;
      let msg = data?.message ?? err?.message ?? 'Something went wrong. Please try again.';
      if (data?.errors) {
        const details = Object.values(data.errors).flat().join('\n');
        if (details) msg = `${msg}\n${details}`;
      }
      Alert.alert('Could not book appointment', msg);
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView
      style={[styles.safeArea, Platform.OS === 'web' && { height: windowHeight }]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* ── 1. Top app bar ──────────────────────────────────────────── */}
        <View style={styles.appBar}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.appBarTitle}>Book Appointment</Text>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleHelp}
            accessibilityLabel="Help"
          >
            <Ionicons name="help-circle-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── 2. Progress indicator ─────────────────────────────────── */}
          <View style={styles.progressRow}>
            {STEPS.map((label, i) => {
              const step = i + 1;
              const done = step < currentStep;
              const current = step === currentStep;
              const filled = done || current;
              return (
                <View key={label} style={styles.stepCol}>
                  {i < STEPS.length - 1 && (
                    <View style={[styles.stepLine, step < currentStep && styles.stepLineDone]} />
                  )}
                  <View style={[styles.stepCircle, filled && styles.stepCircleFilled]}>
                    {done ? (
                      <Ionicons name="checkmark" size={16} color={colors.white} />
                    ) : (
                      <Text style={[styles.stepNum, filled && styles.stepNumFilled]}>{step}</Text>
                    )}
                  </View>
                  <Text style={[styles.stepLabel, filled && styles.stepLabelActive]} numberOfLines={1}>
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* ── 3. Select Pet ─────────────────────────────────────────── */}
          <View style={styles.section}>
            <SectionHeading title="Select Pet" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.petRow}
            >
              <TouchableOpacity
                style={[styles.petCard, styles.petCardAdd]}
                activeOpacity={0.8}
                onPress={handleAddNewPet}
                accessibilityLabel="Add a new pet"
              >
                <View style={styles.addCircle}>
                  <Ionicons name="add" size={24} color={colors.primary} />
                </View>
                <Text style={styles.petName}>Add New Pet</Text>
              </TouchableOpacity>

              {fetchingPets && pets.length === 0 ? (
                <View style={[styles.petCard, styles.petCardLoading]}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : (
                pets.map((pet) => {
                  const isSelected = String(selectedPetId) === String(pet.id);
                  return (
                    <TouchableOpacity
                      key={pet.id}
                      style={[styles.petCard, isSelected && styles.petCardSelected]}
                      activeOpacity={0.85}
                      onPress={() => handleSelectPet(pet)}
                      accessibilityLabel={`Select ${pet.name}`}
                    >
                      {isSelected && (
                        <View style={styles.petCheck}>
                          <Ionicons name="checkmark" size={12} color={colors.white} />
                        </View>
                      )}
                      <PetAvatar pet={pet} size={56} />
                      <Text style={styles.petName} numberOfLines={1}>{pet.name}</Text>
                      <Text style={styles.petSub} numberOfLines={1}>
                        {[pet.species, pet.breed].filter(Boolean).join(' • ') || '—'}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>

          {/* ── 4. Select Branch ──────────────────────────────────────── */}
          <View style={styles.section}>
            <SectionHeading title="Select Branch" />
            {branches.map((b) => {
              const isSelected = selectedBranch === b.name;
              return (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.branchCard, isSelected && styles.branchCardSelected]}
                  activeOpacity={0.85}
                  onPress={() => setSelectedBranch(b.name)}
                  accessibilityLabel={`Select ${b.name}`}
                >
                  <View style={styles.branchTop}>
                    <View style={[styles.radio, isSelected && styles.radioSelected]}>
                      {isSelected && <View style={styles.radioDot} />}
                    </View>
                    <View style={styles.branchInfo}>
                      <View style={styles.branchNameRow}>
                        <Text style={styles.branchName}>{b.name}</Text>
                        {b.badge ? (
                          <View style={styles.recBadge}>
                            <Text style={styles.recBadgeText}>{b.badge}</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.branchAddrRow}>
                        <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                        <Text style={styles.branchAddr}>{b.address}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.branchFooter}>
                    <View style={[styles.statusDot, b.open ? styles.dotOpen : styles.dotClosed]} />
                    <Text style={[styles.branchFooterText, b.open && styles.branchFooterOpen]}>
                      {b.footer}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── 5. Choose Date ────────────────────────────────────────── */}
          <View style={styles.section}>
            <SectionHeading title="Choose Date" />
            <View style={styles.monthRow}>
              <TouchableOpacity
                style={styles.monthBtn}
                onPress={() => scrollDates(-1)}
                accessibilityLabel="Previous dates"
              >
                <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.monthText}>{headerMonth}</Text>
              <TouchableOpacity
                style={styles.monthBtn}
                onPress={() => scrollDates(1)}
                accessibilityLabel="Next dates"
              >
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={dateScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dateRow}
              onScroll={handleDateScroll}
              scrollEventThrottle={64}
            >
              {dates.map((item) => {
                const isSelected = isSameDay(selectedDate, item.date);
                return (
                  <TouchableOpacity
                    key={item.date.toISOString()}
                    style={[
                      styles.dateCard,
                      isSelected && styles.dateCardSelected,
                      !item.available && styles.dateCardDisabled,
                    ]}
                    activeOpacity={0.85}
                    disabled={!item.available}
                    onPress={() => handleSelectDate(item)}
                    accessibilityLabel={`${item.day} ${item.num}${item.available ? '' : ', unavailable'}`}
                  >
                    <Text style={[styles.dateDay, isSelected && styles.dateTextSelected]}>{item.day}</Text>
                    <Text style={[styles.dateNum, isSelected && styles.dateTextSelected]}>{item.num}</Text>
                    <View style={[styles.slotDot, isSelected && styles.slotDotVisible]} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* ── 6. Choose Time ────────────────────────────────────────── */}
          <View style={styles.section}>
            <SectionHeading
              title="Choose Time"
              right={fetchingSlots ? <ActivityIndicator size="small" color={colors.primary} /> : null}
            />
            {isClinicClosed ? (
              <View style={styles.closedCard}>
                <Ionicons name="calendar-outline" size={24} color="#BA1A1A" />
                <Text style={styles.closedTitle}>Clinic Closed on this day</Text>
                <Text style={styles.closedSub}>
                  {selectedBranch} is closed on this day. Please select another date.
                </Text>
              </View>
            ) : availableSlots.length === 0 ? (
              <View style={styles.closedCard}>
                <Ionicons name="time-outline" size={24} color={colors.textSecondary} />
                <Text style={styles.closedTitle}>No Slots Available</Text>
                <Text style={styles.closedSub}>
                  Please choose a date to see operating hours and available time slots.
                </Text>
              </View>
            ) : (
              <View style={styles.timeGrid}>
                {availableSlots.map((slot) => {
                  const booked = bookedSlots.includes(slot);
                  const past = isSlotPast(slot);
                  const disabled = booked || past;
                  const isSelected = selectedTime === slot && !disabled;
                  return (
                    <TouchableOpacity
                      key={slot}
                      style={[
                        styles.timeSlot,
                        isSelected && styles.timeSlotSelected,
                        disabled && styles.timeSlotDisabled,
                      ]}
                      activeOpacity={0.85}
                      disabled={disabled}
                      onPress={() => handleSelectTime(slot)}
                      accessibilityLabel={`${formatSlot(slot)}${booked ? ', booked' : ''}`}
                    >
                      {isSelected && <Ionicons name="checkmark" size={14} color={colors.white} />}
                      <Text
                        style={[
                          styles.timeText,
                          isSelected && styles.timeTextSelected,
                          disabled && styles.timeTextDisabled,
                          booked && styles.timeTextBooked,
                        ]}
                      >
                        {formatSlot(slot)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* ── 7. Reason for Visit ───────────────────────────────────── */}
          <View style={styles.section}>
            <SectionHeading title="Reason for Visit" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {REASONS.map((r) => {
                const isActive = reason === r;
                const isEmergency = r === 'Emergency';
                return (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.chip,
                      isEmergency && styles.chipEmergency,
                      isActive && (isEmergency ? styles.chipEmergencyActive : styles.chipActive),
                    ]}
                    activeOpacity={0.85}
                    onPress={() => setReason(r)}
                    accessibilityLabel={`Reason ${r}`}
                  >
                    {isActive && <Ionicons name="checkmark" size={13} color={colors.white} />}
                    <Text
                      style={[
                        styles.chipText,
                        isEmergency && styles.chipTextEmergency,
                        isActive && styles.chipTextActive,
                      ]}
                    >
                      {r}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.notesLabel}>
              Additional Notes <Text style={styles.optional}>(Optional)</Text>
            </Text>
            <View>
              <TextInput
                style={styles.notesInput}
                placeholder="Anything the clinic staff should know before the visit…"
                placeholderTextColor={colors.borderDashed}
                value={notes}
                onChangeText={setNotes}
                multiline
                maxLength={NOTES_MAX}
                textAlignVertical="top"
                accessibilityLabel="Additional notes"
              />
              <Text style={styles.counter}>{notes.length}/{NOTES_MAX}</Text>
            </View>
          </View>
        </ScrollView>

        {/* ── 8. Sticky bottom bar ───────────────────────────────────────── */}
        {pets.length > 0 && (
          <View style={styles.bottomBar}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryLeft}>
                {selectedPet ? (
                  <PetAvatar pet={selectedPet} size={32} />
                ) : (
                  <View style={[styles.summaryEmptyAvatar]}>
                    <Ionicons name="paw-outline" size={16} color={colors.borderDashed} />
                  </View>
                )}
                <View style={styles.summaryText}>
                  <Text style={styles.summaryPet} numberOfLines={1}>
                    {selectedPet?.name ?? 'No pet selected'}
                  </Text>
                  <Text style={styles.summaryBranch} numberOfLines={1}>{selectedBranch}</Text>
                </View>
              </View>
              <View style={styles.summaryRight}>
                <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.summaryEst}>{EST_DURATION}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.confirmBtn, loading && styles.confirmBtnDisabled]}
              activeOpacity={0.88}
              onPress={handleSubmit}
              disabled={loading}
              accessibilityLabel="Confirm appointment"
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Text style={styles.confirmText}>Confirm Appointment</Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.white} />
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // minHeight/overflow: lets the inner ScrollView scroll on web (flex children
  // otherwise grow to fit their content instead of being bounded by the screen).
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
    ...(Platform.OS === 'web' ? { overflow: 'hidden' } : null),
  },
  flex: { flex: 1, minHeight: 0 },

  // ── App bar ──────────────────────────────────────────────────────────────
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
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appBarTitle: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.xl,
    color: colors.textPrimary,
  },

  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },

  // ── Progress ─────────────────────────────────────────────────────────────
  progressRow: { flexDirection: 'row' },
  stepCol: { flex: 1, alignItems: 'center', gap: 6 },
  stepLine: {
    position: 'absolute',
    top: 15,
    left: '50%',
    width: '100%',
    height: 2,
    backgroundColor: colors.divider,
  },
  stepLineDone: { backgroundColor: colors.primary },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.cardBeige,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stepNum: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body,
    color: colors.textMuted,
  },
  stepNumFilled: { color: colors.white },
  stepLabel: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  stepLabelActive: {
    fontFamily: fonts.bodySemiBold,
    color: colors.textPrimary,
  },

  // ── Section ──────────────────────────────────────────────────────────────
  section: { gap: spacing.md },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.xl,
    color: colors.textPrimary,
  },
  link: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.body,
    color: colors.primary,
  },
  optional: {
    fontFamily: fonts.bodyRegular,
    color: colors.textMuted,
  },

  // ── Pet cards ────────────────────────────────────────────────────────────
  petRow: { gap: spacing.md, paddingVertical: 4, paddingRight: spacing.base },
  petCard: {
    width: 128,
    height: 123,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    gap: 4,
    ...shadows.soft,
  },
  petCardSelected: { borderColor: colors.primary },
  petCardAdd: {
    borderStyle: 'dashed',
    borderColor: colors.primaryLight,
    backgroundColor: colors.cardWarm,
  },
  petCardLoading: { backgroundColor: colors.cardWarm },
  addCircle: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryPale,
    justifyContent: 'center',
    alignItems: 'center',
  },
  petCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  petName: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
    maxWidth: '100%',
  },
  petSub: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    maxWidth: '100%',
  },
  avatarFallback: {
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Branch cards ─────────────────────────────────────────────────────────
  branchCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.base,
    gap: spacing.md,
    ...shadows.soft,
  },
  branchCardSelected: { borderColor: colors.primary },
  branchTop: { flexDirection: 'row', gap: spacing.md },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.borderDashed,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  branchInfo: { flex: 1, gap: 4 },
  branchNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  branchName: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  recBadge: {
    backgroundColor: colors.primaryPale,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
  },
  recBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.primaryDeep,
  },
  branchAddrRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  branchAddr: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body,
    color: colors.textSecondary,
  },
  branchFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  statusDot: { width: 8, height: 8, borderRadius: radii.pill },
  dotOpen: { backgroundColor: colors.primary },
  dotClosed: { backgroundColor: colors.borderDashed },
  branchFooterText: {
    flexShrink: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  branchFooterOpen: { color: colors.primaryDeep },

  // ── Date strip ───────────────────────────────────────────────────────────
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  monthBtn: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: colors.cardBeige,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthText: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  dateRow: { gap: DATE_GAP, paddingVertical: 8, paddingRight: spacing.base },
  dateCard: {
    width: DATE_CARD_W,
    height: 80,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    ...shadows.soft,
  },
  dateCardSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  dateCardDisabled: { opacity: 0.6 },
  dateDay: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  dateNum: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.textPrimary,
  },
  dateTextSelected: { color: colors.white },
  slotDot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: 'transparent',
    marginTop: 2,
  },
  slotDotVisible: { backgroundColor: colors.amberLight },

  // ── Time grid ────────────────────────────────────────────────────────────
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  timeSlot: {
    width: '31.5%',
    height: 40,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  timeSlotSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  timeSlotDisabled: {
    backgroundColor: colors.cardBeige,
  },
  timeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
  },
  timeTextSelected: { color: colors.white },
  timeTextDisabled: { color: colors.textMuted },
  timeTextBooked: { textDecorationLine: 'line-through' },
  closedCard: {
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: '#FFCDD2',
    borderRadius: radii.md,
    padding: spacing.base,
    alignItems: 'center',
    gap: 6,
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

  // ── Reason chips ─────────────────────────────────────────────────────────
  chipRow: { gap: spacing.sm, paddingRight: spacing.base },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: spacing.base,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipEmergency: {
    backgroundColor: colors.alertRedLight,
    borderColor: colors.alertRed + '55',
  },
  chipEmergencyActive: {
    backgroundColor: colors.alertRed,
    borderColor: colors.alertRed,
  },
  chipText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.body,
    color: colors.textSecondary,
  },
  chipTextEmergency: { color: colors.alertRedDark },
  chipTextActive: { color: colors.white },

  notesLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  notesInput: {
    minHeight: 74,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  counter: {
    position: 'absolute',
    right: spacing.base,
    bottom: spacing.sm,
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },

  // ── Bottom bar ───────────────────────────────────────────────────────────
  bottomBar: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summaryLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summaryEmptyAvatar: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderDashed,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryText: { flex: 1 },
  summaryPet: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
  },
  summaryBranch: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
  },
  summaryRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  summaryEst: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  confirmBtn: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radii.xl,
    shadowColor: colors.primaryDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  confirmBtnDisabled: { opacity: 0.7 },
  confirmText: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.lg,
    color: colors.white,
  },
});

export default BookAppointmentScreen;
