/**
 * PetDetailsScreen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook — Pet Details Screen
 *
 * Sections (top → bottom):
 *  1. Top App Bar    — back | "MY PETS" label + pet name | share + edit buttons
 *  2. Hero Pet Card  — photo with overlay pills, name, meta, membership badge,
 *                      info pills (microchip / breed / weight)
 *  3. Tab bar        — Overview | Medical Records | Vaccinations
 *  4. Tab content
 *       Overview         — Vital Statistics 2×2 grid + Primary Care Clinic card
 *       Medical Records  — Recent Consultations list
 *       Vaccinations     — Vaccination History list
 *  5. Fixed booking bar — "Book Appointment for [Pet Name]"
 *
 * Data:
 *  - Renders instantly from route.params.pet, then refreshes via api.getPet(id)
 *    (falls back to api.getUserPets() and finds by id).
 *  - Medical records via api.getMedicalRecords(id). The backend route may not
 *    exist yet, so failures are swallowed and an empty list is used.
 *  - Vaccinations are derived from the `vaccinations` text on medical records.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  Linking,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { colors, fonts, fontSizes, spacing, radii, shadows } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import ThemedDialog from '../components/ThemedDialog';

// ─── Constants ───────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Medical Records', 'Vaccinations'];

// Placeholder clinic contact
const CLINIC_INFO = {
  name: 'BK Petaholic Animal Clinic',
  title: 'Mabini & Batangas City Branches',
  experience: 'Full-Service Pet Care',
  phone: '+63 2 1234 5678',
  clinic: 'Batangas, Philippines',
};

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Species → accent color (same palette as MyPetsScreen). */
const speciesColor = (species = '') => {
  const s = String(species).toLowerCase();
  if (s === 'dog')    return '#4A7C59';
  if (s === 'cat')    return '#705C30';
  if (s === 'bird')   return '#78A886';
  if (s === 'rabbit') return '#B83230';
  return '#6B6358';
};

/** "Allergies: a, b" is appended to medical_conditions by AddPetScreen. */
const parseAllergies = (medicalConditions) => {
  const match = /Allergies:\s*(.+)$/i.exec(medicalConditions ?? '');
  if (!match) return [];
  return match[1].split(',').map((a) => a.trim()).filter(Boolean);
};

const formatAge = (age) =>
  age == null || age === '' ? '—' : `${age} yr${Number(age) === 1 ? '' : 's'}`;

const formatWeight = (weight) =>
  weight == null || weight === '' ? '—' : `${Number(weight)} kg`;

const formatGender = (gender) =>
  gender ? gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase() : '—';

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatLongDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

/** Normalise the records response ({records}, {medical_records}, {data} or []). */
const extractList = (data, keys) => {
  if (Array.isArray(data)) return data;
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
};

/**
 * Up-to-date  : administered < 335 days ago
 * Due soon    : 335–365 days ago (annual booster approaching)
 * Overdue     : > 365 days ago
 */
const vaccineStatus = (dateValue) => {
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) {
    return { label: 'Up to date', bg: colors.primaryPale, text: colors.primaryDeep, icon: colors.primary };
  }
  const days = (Date.now() - d.getTime()) / DAY_MS;
  if (days > 365) {
    return { label: 'Overdue', bg: colors.alertRedLight, text: colors.alertRedDark, icon: colors.alertRed };
  }
  if (days >= 335) {
    return { label: 'Due soon', bg: colors.amberLight, text: colors.amberDark, icon: colors.amber };
  }
  return { label: 'Up to date', bg: colors.primaryPale, text: colors.primaryDeep, icon: colors.primary };
};

/** Flatten each record's free-text `vaccinations` into individual vaccine rows. */
const deriveVaccinations = (records) =>
  records.flatMap((rec) =>
    String(rec.vaccinations ?? '')
      .split(/[,;\n]/)
      .map((v) => v.trim())
      .filter(Boolean)
      .map((name, idx) => ({
        key: `${rec.id ?? 'r'}-${idx}`,
        name,
        date: rec.consultation_date,
      })),
  );

// ─────────────────────────────────────────────────────────────────────────────

const PetDetailsScreen = ({ route, navigation }) => {
  const { id: routeId, pet: initialPet } = route.params || {};
  const petId = routeId ?? initialPet?.id;

  // Kept for upcoming owner-specific features (e.g., sharing)
  useAuth();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // ── State ──────────────────────────────────────────────────────────────────
  const [pet, setPet]                       = useState(initialPet || null);
  const [records, setRecords]               = useState([]);
  const [loading, setLoading]               = useState(!initialPet);
  const [refreshing, setRefreshing]         = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [activeTab, setActiveTab]           = useState('Overview');
  const [selectedConsultation, setSelectedConsultation] = useState(null);
  const [consultationModalVisible, setConsultationModalVisible] = useState(false);

  // Delete Pet Dialog States
  const [deleteDialogVisible, setDeleteDialogVisible]   = useState(false);
  const [deleting, setDeleting]                         = useState(false);
  const [successDialogVisible, setSuccessDialogVisible] = useState(false);

  // Contact Modal State
  const [contactModalVisible, setContactModalVisible]   = useState(false);
  const [branches, setBranches] = useState([
    {
      id: 'mabini',
      name: 'Mabini Branch',
      addressSummary: '142 Mabini St., Poblacion, Mabini',
      phone: '0917-123-4567',
      dialUrl: 'tel:09171234567',
    },
    {
      id: 'batangas_city',
      name: 'Batangas City Branch',
      addressSummary: 'N.F. Almario Bldg, Kumintang Ilaya',
      phone: '0918-765-4321',
      dialUrl: 'tel:09187654321',
    },
  ]);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchPet = useCallback(async () => {
    if (petId == null) return;
    try {
      const res = await api.getPet(petId);
      const fresh = res.data?.pet ?? res.data;
      if (fresh && fresh.id != null) {
        setPet((prev) => ({ ...(prev || {}), ...fresh }));
        return;
      }
    } catch (err) {
      console.warn('getPet failed, falling back to list:', err?.response?.status ?? err.message);
    }
    try {
      const res = await api.getUserPets();
      const list = extractList(res.data, ['pets']);
      const found = list.find((p) => String(p.id) === String(petId));
      if (found) setPet((prev) => ({ ...(prev || {}), ...found }));
    } catch (err) {
      console.warn('getUserPets failed:', err?.response?.status ?? err.message);
    }
  }, [petId]);

  const fetchRecords = useCallback(async () => {
    if (petId == null) return;
    try {
      const res = await api.getMedicalRecords(petId);
      setRecords(extractList(res.data, ['records', 'medical_records', 'data']));
    } catch (err) {
      // Endpoint may not exist yet — render the empty state instead
      setRecords([]);
    }
  }, [petId]);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await api.getBranches();
      if (res.data?.data && Array.isArray(res.data.data)) {
        setBranches(res.data.data);
      }
    } catch (err) {}
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([fetchPet(), fetchRecords(), fetchBranches()]);
      setLoading(false);
    })();
  }, [fetchPet, fetchRecords, fetchBranches]);

  useFocusEffect(
    useCallback(() => {
      fetchBranches();
    }, [fetchBranches])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchPet(), fetchRecords(), fetchBranches()]);
    setRefreshing(false);
  }, [fetchPet, fetchRecords, fetchBranches]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleEdit = () => navigation.navigate('AddPet', { petId, pet });
  const handleShare = () => Alert.alert('Share', 'Sharing coming soon');

  const handleDeletePress = () => {
    setDeleteDialogVisible(true);
  };

  const handleConfirmDelete = async () => {
    try {
      setDeleting(true);
      await api.deletePet(petId);
      setDeleting(false);
      setDeleteDialogVisible(false);
      setSuccessDialogVisible(true);
    } catch (err) {
      setDeleting(false);
      setDeleteDialogVisible(false);
      const errMsg = err?.response?.data?.message || 'Failed to delete pet. Please try again.';
      Alert.alert('Delete Failed', errMsg);
    }
  };

  const handleSuccessClose = () => {
    setSuccessDialogVisible(false);
    navigation.navigate('Pets', { refresh: true });
  };

  const handlePickAndUploadAvatar = async () => {
    if (!pet?.id) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please allow access to your photo library to update your pet’s photo.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        const asset = result.assets[0];
        const pickedUri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        setUploadingAvatar(true);
        try {
          const res = await api.uploadPetAvatar(pet.id, pickedUri);
          const updatedUrl = res.data?.pet?.avatar_url || pickedUri;
          setPet((prev) => ({ ...(prev || {}), avatar_url: updatedUrl }));
          Alert.alert('Success', 'Pet photo updated successfully!');
        } catch (uploadErr) {
          const errMsg = uploadErr?.response?.data?.message || 'Failed to upload photo. Please try again.';
          Alert.alert('Upload Failed', errMsg);
        } finally {
          setUploadingAvatar(false);
        }
      }
    } catch (err) {
      Alert.alert('Error', 'An error occurred while choosing a photo.');
    }
  };

  const handleBook = () => {
    // BookAppointment is built in a later step; avoid a dev-time navigation error.
    const routeNames = navigation.getState?.()?.routeNames ?? [];
    if (routeNames.includes('BookAppointment')) {
      navigation.navigate('BookAppointment', { petId, pet });
    } else {
      Alert.alert('Book Appointment', 'Appointment booking coming soon!');
    }
  };

  const handleCallClinic = () => setContactModalVisible(true);
  const handleCallVet = handleCallClinic;

  const handleCallBranch = async (url, phone) => {
    try {
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert('Phone Call', `Unable to open dialer. You can call ${phone} directly.`);
    }
  };

  const handleRecordPress = (rec) => {
    setSelectedConsultation(rec);
    setConsultationModalVisible(true);
  };

  // ── Loading / missing guards ───────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!pet) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Ionicons name="paw-outline" size={40} color={colors.borderDashed} />
          <Text style={styles.emptyTitle}>Pet not found</Text>
          <TouchableOpacity style={styles.inlineBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.inlineBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const accent      = speciesColor(pet.species);
  const allergies   = parseAllergies(pet.medical_conditions);
  const microchipId = pet.microchip_id || pet.microchipId || null;
  const vaccines    = deriveVaccinations(records);

  const metaLine = [
    pet.species,
    pet.breed,
    pet.age != null && pet.age !== '' ? formatAge(pet.age) : null,
    pet.gender ? formatGender(pet.gender) : null,
  ].filter(Boolean).join(' • ');

  // ─── Tab content ───────────────────────────────────────────────────────────

  const renderOverview = () => (
    <>
      {/* Vital Statistics */}
      <Text style={styles.sectionTitle}>Vital Statistics</Text>
      <View style={styles.statGrid}>
        <View style={styles.statCard}>
          <Ionicons name="paw-outline" size={18} color={colors.primary} />
          <Text style={styles.statLabel}>AGE</Text>
          <Text style={styles.statValue}>{formatAge(pet.age)}</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="barbell-outline" size={18} color={colors.primary} />
          <Text style={styles.statLabel}>WEIGHT</Text>
          <Text style={styles.statValue}>{formatWeight(pet.weight)}</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="male-female-outline" size={18} color={colors.primary} />
          <Text style={styles.statLabel}>SEX</Text>
          <Text style={styles.statValue}>{formatGender(pet.gender)}</Text>
        </View>
        <View style={[styles.statCard, allergies.length > 0 && styles.statCardAlert]}>
          <Ionicons
            name="warning-outline"
            size={18}
            color={allergies.length > 0 ? colors.alertRed : colors.textMuted}
          />
          <Text style={styles.statLabel}>ALLERGIES</Text>
          <Text
            style={[styles.statValue, allergies.length > 0 && styles.statValueAlert]}
            numberOfLines={2}
          >
            {allergies.length > 0 ? allergies.join(', ') : 'None'}
          </Text>
        </View>
      </View>

      {/* Latest Consultation Summary Card */}
      {records.length > 0 && (
        <>
          <View style={[styles.sectionHeaderRow, styles.sectionTitleSpaced]}>
            <Text style={styles.sectionTitle}>Latest Consultation</Text>
            <TouchableOpacity onPress={() => setActiveTab('Medical Records')} accessibilityLabel="View all consultations">
              <Text style={styles.seeAll}>View All</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.latestConsultCard}
            activeOpacity={0.88}
            onPress={() => handleRecordPress(records[0])}
            accessibilityLabel="View latest consultation details"
          >
            <View style={styles.latestConsultTop}>
              <View style={styles.latestConsultIcon}>
                <Ionicons name="medical" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.latestConsultDate}>
                  {formatDate(records[0].consultation_date).toUpperCase()}
                </Text>
                <Text style={styles.latestConsultTitle} numberOfLines={1}>
                  {records[0].diagnosis || 'General Consultation'}
                </Text>
              </View>
              <View style={styles.latestConsultVetBadge}>
                <Ionicons name="person-outline" size={11} color={colors.textSecondary} />
                <Text style={styles.latestConsultVetText} numberOfLines={1}>
                  {records[0].veterinarian || 'Clinic Staff'}
                </Text>
              </View>
            </View>

            {records[0].treatment ? (
              <Text style={styles.latestConsultDesc} numberOfLines={2}>
                {records[0].treatment}
              </Text>
            ) : null}

            <View style={styles.recordBadgesRow}>
              {records[0].prescriptions ? (
                <View style={styles.recordRxBadge}>
                  <Ionicons name="bandage-outline" size={12} color={colors.primaryDeep} />
                  <Text style={styles.recordRxText} numberOfLines={1}>
                    Rx: {records[0].prescriptions}
                  </Text>
                </View>
              ) : null}

              {records[0].next_visit_date ? (
                <View style={styles.recordFollowUpBadge}>
                  <Ionicons name="calendar-outline" size={12} color={colors.amberDark} />
                  <Text style={styles.recordFollowUpText}>
                    Follow-up: {formatDate(records[0].next_visit_date)}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.latestConsultFooter}>
              <Text style={styles.recordViewDetailsText}>View Full Consultation Details</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.primary} />
            </View>
          </TouchableOpacity>
        </>
      )}

      {/* Primary Care Clinic */}
      <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>Primary Care Clinic</Text>
      <View style={styles.clinicCard}>
        <View style={styles.clinicTop}>
          <View style={styles.vetAvatar}>
            <Ionicons name="medical-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.clinicInfo}>
            <Text style={styles.vetName}>{CLINIC_INFO.name}</Text>
            <Text style={styles.vetTitle}>{CLINIC_INFO.title}</Text>
            <View style={styles.expBadge}>
              <Text style={styles.expBadgeText}>{CLINIC_INFO.experience}</Text>
            </View>
          </View>
        </View>
        <View style={styles.clinicLocationRow}>
          <Ionicons name="location-outline" size={14} color={colors.textMuted} />
          <Text style={styles.clinicLocation}>{CLINIC_INFO.clinic}</Text>
        </View>
        <TouchableOpacity
          style={styles.callBtn}
          activeOpacity={0.85}
          onPress={handleCallClinic}
          accessibilityLabel="Contact clinic"
        >
          <Ionicons name="call-outline" size={16} color={colors.primary} />
          <Text style={styles.callBtnText}>Contact Clinic</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderMedicalRecords = () => (
    <>
      <Text style={styles.sectionTitle}>Recent Consultations</Text>

      {records.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="document-text-outline" size={32} color={colors.borderDashed} />
          <Text style={styles.emptyTitle}>No records yet</Text>
          <Text style={styles.emptySub}>
            Consultations for {pet.name} will appear here after a clinic visit.
          </Text>
        </View>
      ) : (
        records.map((rec, idx) => (
          <TouchableOpacity
            key={rec.id ?? idx}
            style={styles.recordCard}
            activeOpacity={0.85}
            onPress={() => handleRecordPress(rec)}
          >
            <View style={styles.recordTopRow}>
              <Text style={styles.recordDate}>{formatDate(rec.consultation_date).toUpperCase()}</Text>
              <View style={styles.recordVetRow}>
                <Ionicons name="person-outline" size={12} color={colors.textMuted} />
                <Text style={styles.recordVet} numberOfLines={1}>{rec.veterinarian || 'Clinic Staff'}</Text>
              </View>
            </View>

            <Text style={styles.recordTitle}>{rec.diagnosis || 'General Consultation'}</Text>

            <Text style={styles.recordDesc} numberOfLines={2}>
              {rec.treatment || rec.notes || 'Tap to view full consultation details.'}
            </Text>

            {/* Prescriptions & Follow-up Badges */}
            {(rec.prescriptions || rec.next_visit_date) ? (
              <View style={styles.recordBadgesRow}>
                {rec.prescriptions ? (
                  <View style={styles.recordRxBadge}>
                    <Ionicons name="bandage-outline" size={12} color={colors.primaryDeep} />
                    <Text style={styles.recordRxText} numberOfLines={1}>
                      Rx: {rec.prescriptions}
                    </Text>
                  </View>
                ) : null}

                {rec.next_visit_date ? (
                  <View style={styles.recordFollowUpBadge}>
                    <Ionicons name="calendar-outline" size={12} color={colors.amberDark} />
                    <Text style={styles.recordFollowUpText}>
                      Follow-up: {formatDate(rec.next_visit_date)}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.recordFooter}>
              <Text style={styles.recordViewDetailsText}>View Full Consultation Details</Text>
              <Ionicons name="chevron-forward" size={15} color={colors.primary} />
            </View>
          </TouchableOpacity>
        ))
      )}
    </>
  );

  const renderVaccinations = () => (
    <>
      <Text style={styles.sectionTitle}>Vaccination History</Text>
      {vaccines.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="medical-outline" size={32} color={colors.borderDashed} />
          <Text style={styles.emptyTitle}>No vaccinations yet</Text>
          <Text style={styles.emptySub}>
            Vaccines recorded at the clinic will be listed here.
          </Text>
        </View>
      ) : (
        vaccines.map((v) => {
          const status = vaccineStatus(v.date);
          return (
            <View key={v.key} style={styles.vaccineCard}>
              <View style={[styles.vaccineIcon, { backgroundColor: status.bg }]}>
                <Ionicons name="medical-outline" size={16} color={status.icon} />
              </View>
              <View style={styles.vaccineInfo}>
                <Text style={styles.vaccineName} numberOfLines={1}>{v.name}</Text>
                <View style={styles.vaccineDateRow}>
                  <Ionicons name="time-outline" size={11} color={colors.textMuted} />
                  <Text style={styles.vaccineDate}>{formatDate(v.date)}</Text>
                </View>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                <Text style={[styles.statusBadgeText, { color: status.text }]}>{status.label}</Text>
              </View>
            </View>
          );
        })
      )}
    </>
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        Platform.OS === 'web' && { height: windowHeight },
      ]}
      edges={['top']}
    >

      {/* ── 1. Top App Bar ─────────────────────────────────────────────── */}
      <View style={styles.appBar}>
        <TouchableOpacity
          style={styles.circleBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.appBarTitle}>
          <Text style={styles.appBarLabel}>MY PETS</Text>
          <Text style={styles.appBarName} numberOfLines={1}>{pet.name}</Text>
        </View>

        <View style={styles.appBarActions}>
          <TouchableOpacity
            style={styles.circleBtn}
            onPress={handleShare}
            accessibilityLabel="Share pet profile"
          >
            <Ionicons name="share-outline" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.circleBtn}
            onPress={handleEdit}
            accessibilityLabel="Edit pet"
          >
            <Ionicons name="create-outline" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.circleBtn, styles.deleteCircleBtn]}
            onPress={handleDeletePress}
            accessibilityLabel="Delete pet"
          >
            <Ionicons name="trash-outline" size={18} color={colors.alertRed} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 100 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={true}
        nestedScrollEnabled={true}
        bounces={true}
        alwaysBounceVertical={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* ── 2. Hero Pet Card ─────────────────────────────────────────── */}
        <View style={styles.heroCard}>
          <View style={styles.photoWrap}>
            {pet.avatar_url ? (
              <Image source={{ uri: pet.avatar_url }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: accent + '22' }]}>
                <Ionicons name="paw-outline" size={64} color={accent} />
              </View>
            )}

            {/* Top-left: Active Patient */}
            <View style={[styles.overlayPill, styles.overlayTopLeft]}>
              <View style={styles.activeDot} />
              <Text style={styles.overlayText}>Active Patient</Text>
            </View>

            {/* Bottom-left: Change Photo Pill */}
            <TouchableOpacity
              style={styles.changePhotoBtn}
              onPress={handlePickAndUploadAvatar}
              disabled={uploadingAvatar}
              activeOpacity={0.8}
              accessibilityLabel="Change pet photo"
            >
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Ionicons name="camera" size={14} color={colors.white} />
                  <Text style={styles.changePhotoText}>Edit Photo</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Bottom-right: microchip */}
            {microchipId ? (
              <View style={[styles.overlayPill, styles.overlayBottomRight]}>
                <Ionicons name="hardware-chip-outline" size={12} color={colors.textPrimary} />
                <Text style={styles.overlayText}>{microchipId}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.heroInfo}>
            <View style={styles.heroNameRow}>
              <Text style={styles.heroName} numberOfLines={1}>{pet.name}</Text>
              <Ionicons name="paw-outline" size={20} color={colors.primaryLight} />
            </View>
            <Text style={styles.heroMeta}>{metaLine || '—'}</Text>

            <View style={styles.memberBadge}>
              <Ionicons name="ribbon-outline" size={12} color={colors.amberDark} />
              <Text style={styles.memberBadgeText}>Gold Care Member</Text>
            </View>

            <View style={styles.infoPillRow}>
              <View style={styles.infoPill}>
                <Ionicons name="hardware-chip-outline" size={12} color={colors.textTertiary} />
                <Text style={styles.infoPillText}>{microchipId || 'No microchip'}</Text>
              </View>
              <View style={styles.infoPill}>
                <Ionicons name="paw-outline" size={12} color={colors.textTertiary} />
                <Text style={styles.infoPillText} numberOfLines={1}>{pet.breed || pet.species || '—'}</Text>
              </View>
              <View style={styles.infoPill}>
                <Ionicons name="barbell-outline" size={12} color={colors.textTertiary} />
                <Text style={styles.infoPillText}>{formatWeight(pet.weight)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 3. Tab bar ───────────────────────────────────────────────── */}
        <View style={styles.tabBar}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, isActive && styles.tabActive]}
                activeOpacity={0.85}
                onPress={() => setActiveTab(tab)}
                accessibilityLabel={`${tab} tab`}
              >
                <Text
                  style={[styles.tabText, isActive && styles.tabTextActive]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── 4. Tab content ───────────────────────────────────────────── */}
        <View style={styles.tabContent}>
          {activeTab === 'Overview' && renderOverview()}
          {activeTab === 'Medical Records' && renderMedicalRecords()}
          {activeTab === 'Vaccinations' && renderVaccinations()}
        </View>

        {/* ── 5. Delete Pet Button ──────────────────────────────────────── */}
        <View style={styles.deleteSection}>
          <TouchableOpacity
            style={styles.deletePetBtn}
            activeOpacity={0.82}
            onPress={handleDeletePress}
            accessibilityLabel={`Delete ${pet.name}`}
          >
            <Ionicons name="trash-outline" size={17} color={colors.alertRed} />
            <Text style={styles.deletePetBtnText}>Delete Pet</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── 6. Fixed booking bar ─────────────────────────────────────────── */}
      <View style={[styles.bookingBar, { paddingBottom: spacing.base + insets.bottom }]}>
        <TouchableOpacity
          style={styles.bookBtn}
          activeOpacity={0.88}
          onPress={handleBook}
          accessibilityLabel={`Book appointment for ${pet.name}`}
        >
          <Ionicons name="calendar-outline" size={18} color={colors.white} />
          <Text style={styles.bookBtnText} numberOfLines={1}>
            Book Appointment for {pet.name}
          </Text>
          <Ionicons name="arrow-forward" size={16} color={colors.white} />
        </TouchableOpacity>
      </View>

      {/* ── Confirmation Dialog ────────────────────────────────────────── */}
      <ThemedDialog
        visible={deleteDialogVisible}
        title="Delete Pet"
        message={`Are you sure you want to delete ${pet.name}? This will also remove their appointments and records.`}
        type="confirm"
        destructive
        confirmText="Delete Pet"
        cancelText="Cancel"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => !deleting && setDeleteDialogVisible(false)}
      />

      {/* ── Success Dialog ─────────────────────────────────────────────── */}
      <ThemedDialog
        visible={successDialogVisible}
        title="Pet Deleted"
        message={`${pet.name} has been deleted successfully.`}
        type="success"
        confirmText="OK"
        onConfirm={handleSuccessClose}
      />

      {/* ── Contact BK Petaholic Modal ────────────────────────────────────── */}
      <Modal
        visible={contactModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setContactModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setContactModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.contactModalContainer}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <View style={styles.contactModalHeader}>
              <View style={styles.contactModalHeaderLeft}>
                <View style={styles.contactModalPawBadge}>
                  <Ionicons name="call" size={18} color={colors.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactModalTitle}>Contact BK Petaholic</Text>
                  <Text style={styles.contactModalSubtitle}>
                    Choose a branch to call or consult our AI Assistant.
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setContactModalVisible(false)}
                style={styles.contactModalCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Close modal"
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Options List */}
            <View style={styles.contactOptionsList}>
              {branches.map((b) => (
                <View key={b.id} style={styles.contactOptionCard}>
                  <View style={styles.contactOptionInfo}>
                    <View style={styles.contactOptionTitleRow}>
                      <Ionicons name="location" size={14} color={colors.primary} />
                      <Text style={styles.contactOptionBranch}>{b.name}</Text>
                    </View>
                    <Text style={styles.contactOptionAddress}>{b.addressSummary || b.address}</Text>
                    <View style={styles.contactOptionPhoneRow}>
                      <Ionicons name="call-outline" size={12} color={colors.textSecondary} />
                      <Text style={styles.contactOptionPhone}>{b.phone}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.branchCallBtn}
                    activeOpacity={0.85}
                    onPress={() => handleCallBranch(b.dialUrl, b.phone)}
                    accessibilityLabel={`Call ${b.name}`}
                  >
                    <Ionicons name="call" size={13} color={colors.white} />
                    <Text style={styles.branchCallBtnText}>Call {b.name.replace(' Branch', '')}</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {/* Option 3: AI Assistant */}
              <TouchableOpacity
                style={styles.chatOptionCard}
                activeOpacity={0.85}
                onPress={() => {
                  setContactModalVisible(false);
                  navigation.navigate('Chat');
                }}
                accessibilityLabel="Chat with AI Assistant"
              >
                <View style={styles.chatOptionIconCircle}>
                  <Ionicons name="chatbubbles" size={20} color={colors.primary} />
                </View>
                <View style={styles.chatOptionContent}>
                  <Text style={styles.chatOptionTitle}>AI Assistant</Text>
                  <Text style={styles.chatOptionDesc}>24/7 instant guidance for pet care & wellness</Text>
                </View>
                <View style={styles.chatActionPill}>
                  <Text style={styles.chatActionPillText}>Chat Now</Text>
                  <Ionicons name="arrow-forward" size={12} color={colors.primary} />
                </View>
              </TouchableOpacity>
            </View>

            {/* Cancel Button */}
            <TouchableOpacity
              style={styles.contactModalCancelBtn}
              activeOpacity={0.85}
              onPress={() => setContactModalVisible(false)}
              accessibilityLabel="Cancel"
            >
              <Text style={styles.contactModalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Consultation Details Modal ────────────────────────────────────── */}
      <Modal
        visible={consultationModalVisible && Boolean(selectedConsultation)}
        transparent
        animationType="fade"
        onRequestClose={() => setConsultationModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setConsultationModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.consultModalContainer}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            {selectedConsultation ? (
              <>
                {/* Modal Header */}
                <View style={styles.consultModalHeader}>
                  <View style={styles.consultModalHeaderLeft}>
                    <View style={styles.consultModalBadge}>
                      <Ionicons name="medical" size={20} color={colors.white} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.consultModalTitle}>Consultation Details</Text>
                      <Text style={styles.consultModalSubtitle} numberOfLines={1}>
                        {formatLongDate(selectedConsultation.consultation_date)} &bull; {selectedConsultation.veterinarian || 'BK Petaholic Staff'}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setConsultationModalVisible(false)}
                    style={styles.consultModalCloseBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Close consultation details"
                  >
                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                {/* Modal Body */}
                <ScrollView
                  style={styles.consultModalScroll}
                  contentContainerStyle={styles.consultModalBody}
                  showsVerticalScrollIndicator={false}
                >
                  {/* Section 1: Diagnosis */}
                  <View style={styles.consultSection}>
                    <View style={styles.consultSectionLabelRow}>
                      <Ionicons name="fitness-outline" size={13} color={colors.primary} />
                      <Text style={styles.consultSectionLabel}>DIAGNOSIS</Text>
                    </View>
                    <View style={styles.consultCard}>
                      <Text style={styles.consultBoldText}>
                        {selectedConsultation.diagnosis || 'General Consultation'}
                      </Text>
                    </View>
                  </View>

                  {/* Section 2: Treatment */}
                  <View style={styles.consultSection}>
                    <View style={styles.consultSectionLabelRow}>
                      <Ionicons name="git-commit-outline" size={13} color={colors.primary} />
                      <Text style={styles.consultSectionLabel}>TREATMENT & PROCEDURES</Text>
                    </View>
                    <View style={styles.consultCard}>
                      {selectedConsultation.treatment ? (
                        <Text style={styles.consultText}>{selectedConsultation.treatment}</Text>
                      ) : (
                        <Text style={styles.consultMutedText}>None specified</Text>
                      )}
                    </View>
                  </View>

                  {/* Section 3: Prescriptions */}
                  <View style={styles.consultSection}>
                    <View style={styles.consultSectionLabelRow}>
                      <Ionicons name="bandage-outline" size={13} color={colors.primary} />
                      <Text style={styles.consultSectionLabel}>PRESCRIPTIONS & MEDICATION</Text>
                    </View>
                    <View style={[styles.consultCard, selectedConsultation.prescriptions && styles.consultCardRx]}>
                      {selectedConsultation.prescriptions ? (
                        <View style={styles.consultRxRow}>
                          <Ionicons name="medkit" size={16} color={colors.primary} style={{ marginTop: 2 }} />
                          <Text style={styles.consultRxText}>
                            {selectedConsultation.prescriptions}
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.consultMutedText}>No prescriptions issued</Text>
                      )}
                    </View>
                  </View>

                  {/* Section 4: Clinical Notes & Advice */}
                  <View style={styles.consultSection}>
                    <View style={styles.consultSectionLabelRow}>
                      <Ionicons name="document-text-outline" size={13} color={colors.primary} />
                      <Text style={styles.consultSectionLabel}>DOCTOR'S NOTES & ADVICE</Text>
                    </View>
                    <View style={styles.consultCard}>
                      {selectedConsultation.notes ? (
                        <Text style={styles.consultText}>{selectedConsultation.notes}</Text>
                      ) : (
                        <Text style={styles.consultMutedText}>No additional notes</Text>
                      )}
                    </View>
                  </View>

                  {/* Section 5: Vaccinations Administered */}
                  {selectedConsultation.vaccinations ? (
                    (() => {
                      const vaxes = String(selectedConsultation.vaccinations)
                        .split(/[,;\n]/)
                        .map((v) => v.trim())
                        .filter(Boolean);
                      if (vaxes.length === 0) return null;
                      return (
                        <View style={styles.consultSection}>
                          <View style={styles.consultSectionLabelRow}>
                            <Ionicons name="shield-checkmark-outline" size={13} color={colors.primary} />
                            <Text style={styles.consultSectionLabel}>VACCINATIONS ADMINISTERED</Text>
                          </View>
                          <View style={styles.vaxChipWrap}>
                            {vaxes.map((vx, i) => (
                              <View key={i} style={styles.vaxChip}>
                                <Ionicons name="medical" size={12} color={colors.primaryDeep} />
                                <Text style={styles.vaxChipText}>{vx}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      );
                    })()
                  ) : null}

                  {/* Section 6: Next Visit / Follow-up */}
                  {selectedConsultation.next_visit_date ? (
                    <View style={styles.followUpCard}>
                      <Ionicons name="calendar" size={18} color={colors.amberDark} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.followUpLabel}>NEXT SCHEDULED FOLLOW-UP</Text>
                        <Text style={styles.followUpDate}>
                          {formatLongDate(selectedConsultation.next_visit_date)}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </ScrollView>

                {/* Modal Footer / Close Button */}
                <View style={styles.consultModalFooter}>
                  <TouchableOpacity
                    style={styles.consultModalCloseActionBtn}
                    activeOpacity={0.85}
                    onPress={() => setConsultationModalVisible(false)}
                    accessibilityLabel="Close consultation details"
                  >
                    <Text style={styles.consultModalCloseActionText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
    ...(Platform.OS === 'web' ? { overflow: 'hidden' } : null),
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },

  // ── App bar ──────────────────────────────────────────────────────────────
  appBar: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.soft,
  },
  appBarTitle: {
    flex: 1,
  },
  appBarLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body,
    color: colors.textSecondary,
    letterSpacing: 1.2,
  },
  appBarName: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.xxl,
    color: colors.textPrimary,
  },
  appBarActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },

  // ── Scroll ───────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    gap: spacing.base,
  },

  // ── Hero card ────────────────────────────────────────────────────────────
  heroCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  photoWrap: {
    width: '100%',
    height: 224,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayPill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  overlayTopLeft: {
    top: spacing.md,
    left: spacing.md,
  },
  overlayBottomRight: {
    bottom: spacing.md,
    right: spacing.md,
  },
  changePhotoBtn: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(46, 50, 48, 0.78)',
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  changePhotoText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs,
    color: colors.white,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  overlayText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
  },
  heroInfo: {
    paddingTop: spacing.base,
    paddingHorizontal: spacing.xs,
    gap: spacing.sm,
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroName: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.display,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  heroMeta: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  memberBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.amberLight,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  memberBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.amberDark,
  },
  infoPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    backgroundColor: colors.cardWarm,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoPillText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
    flexShrink: 1,
  },

  // ── Tabs ─────────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.cardBeige,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.white,
  },
  tabContent: {
    gap: spacing.md,
  },

  // ── Section headings ─────────────────────────────────────────────────────
  sectionTitle: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.xl,
    color: colors.textPrimary,
  },
  sectionTitleSpaced: {
    marginTop: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seeAll: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.body,
    color: colors.primary,
  },

  // ── Vital stats ──────────────────────────────────────────────────────────
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.cardWarm,
    borderRadius: radii.xl,
    padding: spacing.base,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statCardAlert: {
    backgroundColor: colors.alertRedLight,
    borderColor: colors.alertRed + '33',
  },
  statLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginTop: 4,
  },
  statValue: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.lg,
    color: colors.textPrimary,
  },
  statValueAlert: {
    color: colors.alertRedDark,
  },

  // ── Clinic card ──────────────────────────────────────────────────────────
  clinicCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  clinicTop: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  vetAvatar: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryPale,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clinicInfo: {
    flex: 1,
    gap: 3,
  },
  vetName: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  vetTitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body,
    color: colors.textSecondary,
  },
  expBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryPale,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
    marginTop: 2,
  },
  expBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.primaryDeep,
  },
  clinicLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  clinicLocation: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body,
    color: colors.textMuted,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    backgroundColor: colors.primaryPale,
  },
  callBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.primary,
  },

  // ── Medical records ──────────────────────────────────────────────────────
  recordCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  recordTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  recordDate: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.amber,
    letterSpacing: 0.8,
  },
  recordTitle: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  recordDesc: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  recordBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 4,
  },
  recordRxBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryPale,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  recordRxText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.primaryDeep,
    flexShrink: 1,
  },
  recordFollowUpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.amberLight,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  recordFollowUpText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.amberDark,
  },
  recordFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  recordViewDetailsText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.primary,
  },
  recordVetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  recordVet: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
  },

  // ── Latest Consultation Summary (Overview Tab) ───────────────────────────
  latestConsultCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  latestConsultTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  latestConsultIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryPale,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  latestConsultDate: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.amber,
    letterSpacing: 0.8,
  },
  latestConsultTitle: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    marginTop: 1,
  },
  latestConsultVetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.cardBeige,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  latestConsultVetText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
  },
  latestConsultDesc: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  latestConsultFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },

  // ── Vaccinations ─────────────────────────────────────────────────────────
  vaccineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  vaccineIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vaccineInfo: {
    flex: 1,
    gap: 2,
  },
  vaccineName: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
  },
  vaccineDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  vaccineDate: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
  },
  statusBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
  },

  // ── Empty states ─────────────────────────────────────────────────────────
  emptyCard: {
    backgroundColor: colors.cardWarm,
    borderRadius: radii.xl,
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
  emptySub: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  inlineBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  inlineBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.white,
  },

  // ── Fixed booking bar ────────────────────────────────────────────────────
  bookingBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.base,
    shadowColor: colors.primaryDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  bookBtnText: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.md,
    color: colors.white,
    flexShrink: 1,
  },
  deleteCircleBtn: {
    borderColor: 'rgba(184, 50, 48, 0.2)',
    backgroundColor: '#FFF5F5',
  },
  deleteSection: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  deletePetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: colors.alertRedLight, // #FFDAD8
    borderWidth: 1,
    borderColor: 'rgba(184, 50, 48, 0.25)',
  },
  deletePetBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.sm + 1,
    color: colors.alertRed,
  },

  // ── Contact Modal ────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
    padding: spacing.base,
  },
  contactModalContainer: {
    backgroundColor: colors.cardWarm,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
    gap: spacing.base,
  },
  contactModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  contactModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  contactModalPawBadge: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  contactModalTitle: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.lg,
    color: colors.textPrimary,
  },
  contactModalSubtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  contactModalCloseBtn: {
    padding: spacing.xs,
  },
  contactOptionsList: {
    gap: spacing.sm,
  },
  contactOptionCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    ...shadows.soft,
  },
  contactOptionInfo: {
    flex: 1,
    gap: 3,
  },
  contactOptionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  contactOptionBranch: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  contactOptionAddress: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  contactOptionPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  contactOptionPhone: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs,
    color: colors.primary,
  },
  branchCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    flexShrink: 0,
  },
  branchCallBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.white,
  },
  chatOptionCard: {
    backgroundColor: colors.primaryPale,
    borderRadius: radii.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.primaryLight + '55',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chatOptionIconCircle: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chatOptionContent: {
    flex: 1,
  },
  chatOptionTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: colors.primaryDeep,
  },
  chatOptionDesc: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.primaryDeep,
    opacity: 0.8,
  },
  chatActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.white,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
  },
  chatActionPillText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.primary,
  },
  contactModalCancelBtn: {
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.cardWarm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  contactModalCancelText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },

  // ── Consultation Details Modal ──────────────────────────────────────────
  consultModalContainer: {
    backgroundColor: colors.cardWarm,
    borderRadius: radii.xl,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
    overflow: 'hidden',
  },
  consultModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  consultModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    marginRight: spacing.sm,
  },
  consultModalBadge: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  consultModalTitle: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.lg,
    color: colors.textPrimary,
  },
  consultModalSubtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  consultModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.cardBeige,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consultModalScroll: {
    maxHeight: 460,
  },
  consultModalBody: {
    padding: spacing.base,
    gap: spacing.md,
  },
  consultSection: {
    gap: 6,
  },
  consultSectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  consultSectionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  consultCard: {
    backgroundColor: colors.background,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  consultCardRx: {
    backgroundColor: colors.primaryPale + '44',
    borderColor: colors.primaryLight + '55',
  },
  consultText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  consultBoldText: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  consultRxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  consultRxText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.body,
    color: colors.primaryDeep,
    lineHeight: 20,
    flex: 1,
  },
  consultMutedText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  vaxChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  vaxChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primaryPale,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
  },
  vaxChipText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs,
    color: colors.primaryDeep,
  },
  followUpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.amberLight,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.amber + '40',
  },
  followUpLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.amberDark,
    letterSpacing: 0.8,
  },
  followUpDate: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.md,
    color: colors.amberDark,
    marginTop: 2,
  },
  consultModalFooter: {
    padding: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  consultModalCloseActionBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md - 2,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consultModalCloseActionText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: colors.white,
  },
});

export default PetDetailsScreen;
