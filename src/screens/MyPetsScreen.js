/**
 * MyPetsScreen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook — My Pets List Screen
 *
 * Sections (top → bottom):
 *  1. Top App Bar   — leaf icon + "My Pets" heading | + Add pill
 *  2. Search bar    — magnifier icon + "Search pets..."
 *  3. Filter chips  — All (active green) | Dogs | Cats | Birds | Others
 *  4. Pet cards     — avatar, name, status badge, species•breed, age/weight, chevron
 *  5. Empty state   — paw icon + "No pets yet" + "Add your first pet" button
 *  6. Hint box      — "Register another companion"
 *
 * Data:
 *  - Pets fetched from GET /user/pets on mount + pull-to-refresh
 *  - Response shape: { pets: [...] }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Image,
  Modal,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, fontSizes, spacing, radii, shadows } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

// ─── Constants ───────────────────────────────────────────────────────────────

const FILTERS = ['All', 'Dogs', 'Cats', 'Birds', 'Others'];

/** Maps a filter label to the species values to match against. */
const FILTER_SPECIES_MAP = {
  All: null,
  Dogs: ['Dog', 'dog'],
  Cats: ['Cat', 'cat'],
  Birds: ['Bird', 'bird'],
  Others: ['Rabbit', 'rabbit', 'Other', 'other'],
};

/** Returns a color for the species dot indicator. */
const speciesDotColor = (species = '') => {
  const s = species.toLowerCase();
  if (s === 'dog') return '#4A7C59';
  if (s === 'cat') return '#705C30';
  if (s === 'bird') return '#78A886';
  if (s === 'rabbit') return '#B83230';
  return '#6B6358';
};

/** Derives health status badge from pet data. */
const petStatus = (pet) => {
  const conds = (pet.medical_conditions ?? '').trim();
  const hasIssue = conds.length > 0;
  return hasIssue
    ? { label: 'Attention', bg: colors.amberLight, text: colors.amberDark }
    : { label: 'Healthy', bg: colors.primaryPale, text: colors.primaryDeep };
};

// ─────────────────────────────────────────────────────────────────────────────

const MyPetsScreen = ({ navigation }) => {
  const { user } = useAuth();

  // ── State ──────────────────────────────────────────────────────────────────
  const [pets, setPets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [contactModalVisible, setContactModalVisible] = useState(false);
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
  const fetchPets = useCallback(async () => {
    try {
      const response = await api.getUserPets();
      // Support { pets: [...] } or direct array
      const list = Array.isArray(response.data?.pets)
        ? response.data.pets
        : Array.isArray(response.data)
          ? response.data
          : [];
      setPets(list);
    } catch (err) {
      console.warn('Could not load pets:', err?.response?.status ?? err.message);
      setPets([]);
    }
  }, []);

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
      setLoading(true);
      await Promise.all([fetchPets(), fetchBranches()]);
      setLoading(false);
    })();
  }, [fetchPets, fetchBranches]);

  useFocusEffect(
    useCallback(() => {
      fetchPets();
      fetchBranches();
    }, [fetchPets, fetchBranches])
  );

  // ── Pull-to-refresh ────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchPets(), fetchBranches()]);
    setRefreshing(false);
  }, [fetchPets, fetchBranches]);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filteredPets = pets.filter((pet) => {
    const matchesSearch = (pet.name ?? '')
      .toLowerCase()
      .includes(searchQuery.toLowerCase().trim());

    if (activeFilter === 'All') return matchesSearch;

    const speciesLower = (pet.species ?? '').toLowerCase();
    let matchesFilter = false;

    if (activeFilter === 'Dogs') {
      matchesFilter = speciesLower === 'dog';
    } else if (activeFilter === 'Cats') {
      matchesFilter = speciesLower === 'cat';
    } else if (activeFilter === 'Birds') {
      matchesFilter = speciesLower === 'bird';
    } else if (activeFilter === 'Others') {
      matchesFilter = !['dog', 'cat', 'bird'].includes(speciesLower);
    }

    return matchesSearch && matchesFilter;
  });

  // ── Navigation helpers ─────────────────────────────────────────────────────
  const goToAddPet = () => navigation.navigate('AddPet');

  const goToPetDetails = (pet) =>
    navigation.navigate('PetDetails', { id: pet.id, pet });

  const handleCallBranch = async (url, phone) => {
    try {
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert('Phone Call', `Unable to open dialer. You can call ${phone} directly.`);
    }
  };

  // ─── Render helpers ────────────────────────────────────────────────────────

  /** Single pet card row */
  const renderPetCard = ({ item: pet }) => {
    const dotColor = speciesDotColor(pet.species);
    const status = petStatus(pet);
    const initials = (pet.name ?? '?').charAt(0).toUpperCase();

    return (
      <TouchableOpacity
        style={styles.petCard}
        activeOpacity={0.82}
        onPress={() => goToPetDetails(pet)}
        accessibilityLabel={`View ${pet.name} profile`}
      >
        {/* Avatar + status dot */}
        <View style={styles.avatarWrapper}>
          {pet.avatar_url ? (
            <Image
              source={{ uri: pet.avatar_url }}
              style={styles.avatarImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.avatar, { borderColor: dotColor + '44' }]}>
              <Text style={[styles.avatarInitial, { color: dotColor }]}>{initials}</Text>
            </View>
          )}
          <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
        </View>

        {/* Pet info */}
        <View style={styles.petInfo}>
          {/* Name + health badge */}
          <View style={styles.petNameRow}>
            <Text style={styles.petName} numberOfLines={1}>{pet.name}</Text>
            <View style={[styles.healthBadge, { backgroundColor: status.bg }]}>
              <Text style={[styles.healthBadgeText, { color: status.text }]}>
                {status.label}
              </Text>
            </View>
          </View>

          {/* Species • Breed */}
          <Text style={styles.petBreed} numberOfLines={1}>
            {pet.species ?? '—'}
            {pet.breed ? ` • ${pet.breed}` : ''}
          </Text>

          {/* Age + Weight */}
          <View style={styles.petMeta}>
            {pet.age != null && (
              <View style={styles.petMetaChip}>
                <Ionicons name="time-outline" size={10} color={colors.textTertiary} />
                <Text style={styles.petMetaText}>{pet.age} yr{pet.age !== 1 ? 's' : ''}</Text>
              </View>
            )}
            {pet.weight != null && (
              <View style={styles.petMetaChip}>
                <Ionicons name="fitness-outline" size={10} color={colors.textTertiary} />
                <Text style={styles.petMetaText}>{pet.weight} kg</Text>
              </View>
            )}
          </View>
        </View>

        {/* Chevron */}
        <Ionicons name="chevron-forward" size={18} color={colors.borderDashed} />
      </TouchableOpacity>
    );
  };

  /** Separator between cards */
  const ItemSeparator = () => <View style={styles.separator} />;

  /** Empty state */
  const EmptyState = () => {
    if (pets.length > 0 && filteredPets.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="search-outline" size={40} color={colors.primaryLight} />
          </View>
          <Text style={styles.emptyTitle}>No matching pets</Text>
          <Text style={styles.emptySubtitle}>
            No companions match your current filter or search query.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <Ionicons name="paw-outline" size={40} color={colors.primaryLight} />
        </View>
        <Text style={styles.emptyTitle}>No pets yet</Text>
        <Text style={styles.emptySubtitle}>
          Add your first furry friend and keep their health records all in one place.
        </Text>
        <TouchableOpacity
          style={styles.emptyAddBtn}
          activeOpacity={0.85}
          onPress={goToAddPet}
          accessibilityLabel="Add your first pet"
        >
          <Ionicons name="add" size={16} color={colors.white} />
          <Text style={styles.emptyAddBtnText}>Add your first pet</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>

      {/* ── 1. Top App Bar ──────────────────────────────────────────────────── */}
      <View style={styles.appBar}>
        {/* Left: leaf icon + heading */}
        <View style={styles.appBarLeft}>
          <View style={styles.leafBadge}>
            <Ionicons name="leaf-outline" size={15} color={colors.white} />
          </View>
          <Text style={styles.screenTitle}>My Pets</Text>
        </View>

        {/* Right: add pill */}
        <View style={styles.appBarRight}>
          <TouchableOpacity
            style={styles.addPill}
            activeOpacity={0.85}
            onPress={goToAddPet}
            accessibilityLabel="Add a new pet"
          >
            <Ionicons name="add" size={16} color={colors.white} />
            <Text style={styles.addPillText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 2. Search Bar ──────────────────────────────────────────────────── */}
      <View style={styles.searchBarWrapper}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={colors.borderDashed} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search pets..."
            placeholderTextColor={colors.borderDashed}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search pets by name"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={colors.borderDashed} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── 3. Filter Chips ────────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterRowContent}
      >
        {FILTERS.map((filter) => {
          const isActive = activeFilter === filter;
          return (
            <TouchableOpacity
              key={filter}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              activeOpacity={0.8}
              onPress={() => setActiveFilter(filter)}
              accessibilityLabel={`Filter by ${filter}`}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {filter}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── 4. Loading spinner / Pet list / Empty state ────────────────────── */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading pets…</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPets}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderPetCard}
          ItemSeparatorComponent={ItemSeparator}
          ListEmptyComponent={<EmptyState />}
          contentContainerStyle={[
            styles.listContent,
            filteredPets.length === 0 && styles.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListFooterComponent={
            filteredPets.length > 0 ? (
              <View>
                {/* ── Primary Care Clinic Card ──────────────────────────────── */}
                <View style={styles.primaryClinicCard}>
                  <View style={styles.primaryClinicHeader}>
                    <View style={styles.primaryClinicAvatar}>
                      <Ionicons name="medical" size={20} color={colors.primary} />
                    </View>
                    <View style={styles.primaryClinicInfo}>
                      <Text style={styles.primaryClinicTitle}>Primary Care Clinic</Text>
                      <Text style={styles.primaryClinicName}>BK Petaholic Animal Clinic</Text>
                      <Text style={styles.primaryClinicHours}>Mabini & Batangas City Branches</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.contactVetBtn}
                    activeOpacity={0.85}
                    onPress={() => setContactModalVisible(true)}
                    accessibilityLabel="Contact Clinic"
                  >
                    <Ionicons name="call" size={15} color={colors.white} />
                    <Text style={styles.contactVetBtnText}>Contact Clinic</Text>
                  </TouchableOpacity>
                </View>

                {/* ── Register another companion hint box ──────────────────── */}
                <View style={styles.hintBox}>
                  <Ionicons name="heart-outline" size={18} color={colors.primaryLight} />
                  <View style={styles.hintBoxText}>
                    <Text style={styles.hintBoxTitle}>Register another companion</Text>
                    <Text style={styles.hintBoxDesc}>
                      Keep all your pet health records in one place — add as many companions as you like.
                    </Text>
                  </View>
                </View>
              </View>
            ) : null
          }
        />
      )}

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
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({

  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── Top App Bar ─────────────────────────────────────────────────────────
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
  leafBadge: {
    width: 32,
    height: 32,
    borderRadius: 9999,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  screenTitle: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.xxl,
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },
  appBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingVertical: 7,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: 9999,
    ...shadows.soft,
  },
  addPillText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.white,
  },

  // ── Search Bar ──────────────────────────────────────────────────────────
  searchBarWrapper: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.base,
    height: 44,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    height: 44,
  },

  // ── Filter Chips ────────────────────────────────────────────────────────
  filterRow: {
    flexGrow: 0,
  },
  filterRowContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    flexDirection: 'row',
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.base,
    borderRadius: 9999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.white,
  },

  // ── Loading ─────────────────────────────────────────────────────────────
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    color: colors.textMuted,
  },

  // ── FlatList ─────────────────────────────────────────────────────────────
  listContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  separator: {
    height: spacing.sm,
  },

  // ── Pet Card ─────────────────────────────────────────────────────────────
  petCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.base,
    gap: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  avatarWrapper: {
    position: 'relative',
    flexShrink: 0,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 9999,
    backgroundColor: colors.cardWarm,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 9999,
    backgroundColor: colors.cardWarm,
  },
  avatarInitial: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.display,
  },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: colors.white,
  },
  petInfo: {
    flex: 1,
    gap: 4,
  },
  petNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  petName: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.xl,
    color: colors.textPrimary,
    flex: 1,
  },
  healthBadge: {
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: 9999,
    flexShrink: 0,
  },
  healthBadgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs,
  },
  petBreed: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body,
    color: colors.textSecondary,
  },
  petMeta: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 2,
  },
  petMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  petMetaText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textTertiary,
  },

  // ── Empty State ──────────────────────────────────────────────────────────
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.base,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 9999,
    backgroundColor: colors.primaryPale,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.display,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xl,
    borderRadius: 9999,
    marginTop: spacing.sm,
    ...shadows.card,
  },
  emptyAddBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.white,
  },

  // ── Hint Box ─────────────────────────────────────────────────────────────
  hintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: colors.primaryPale,
    borderRadius: radii.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.primaryLight + '44',
  },
  hintBoxText: {
    flex: 1,
    gap: 4,
  },
  hintBoxTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.primaryDeep,
  },
  hintBoxDesc: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body,
    color: colors.primaryDeep,
    opacity: 0.7,
    lineHeight: 18,
  },

  // ── Primary Care Clinic Card ─────────────────────────────────────────────
  primaryClinicCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    marginTop: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
    gap: spacing.md,
  },
  primaryClinicHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  primaryClinicAvatar: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.primaryPale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryClinicInfo: {
    flex: 1,
    gap: 2,
  },
  primaryClinicTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  primaryClinicName: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  primaryClinicHours: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  contactVetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.base,
    borderRadius: radii.pill,
    ...shadows.soft,
  },
  contactVetBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.white,
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
});

export default MyPetsScreen;
