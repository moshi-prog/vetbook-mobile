/**
 * AddPetScreen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook — Add / Edit Pet Form Screen
 *
 * Sections (top → bottom):
 *  1. Top Bar         — Cancel (left) | Title + subtitle (center) | Save pill (right)
 *  2. Photo Upload    — Cream card with dashed circular upload area
 *  3. Basic Identity  — Pet Name, Species chips, Breed, Birthday/Age
 *  4. Physical & Health Traits — Gender toggle, Spayed/Neutered switch, Weight
 *  5. Medical Conditions & Allergies — Allergy chips, Medical Notes, Microchip ID
 *  6. Bottom CTA      — "Save Pet" full-width green button
 *
 * API:
 *  - On submit: POST /pets via api.createPet(payload)
 *  - On success: navigate back to MyPets
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Switch,
  Alert,
  Platform,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { colors, fonts, fontSizes, spacing, radii } from '../theme';
import api from '../services/api';
import ThemedDialog from '../components/ThemedDialog';

// ─── Constants ───────────────────────────────────────────────────────────────

const SPECIES_OPTIONS = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Other'];
const GENDER_OPTIONS  = ['Male', 'Female'];

/**
 * Splits a stored medical_conditions string back into free-text notes and the
 * allergy list. On save, allergies are appended as " Allergies: a, b", so we
 * reverse that here to avoid duplicating them when the pet is re-saved.
 */
const splitMedicalConditions = (value) => {
  const text = value ?? '';
  const match = /\s*Allergies:\s*(.*)$/i.exec(text);
  if (!match) return { notes: text.trim(), allergyList: [] };
  return {
    notes: text.slice(0, match.index).trim(),
    allergyList: match[1].split(',').map((a) => a.trim()).filter(Boolean),
  };
};

/** Backend may return lowercase gender; the segmented control expects Male/Female. */
const normalizeGender = (value) => {
  const g = String(value ?? '').toLowerCase();
  if (g === 'male') return 'Male';
  if (g === 'female') return 'Female';
  return 'Female';
};

// ─────────────────────────────────────────────────────────────────────────────

const AddPetScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // ── Edit mode ──────────────────────────────────────────────────────────────
  const { petId, pet: editPet } = route?.params || {};
  const isEditMode = !!petId;
  const initial = isEditMode ? (editPet || {}) : {};
  const initialMedical = splitMedicalConditions(initial.medical_conditions);

  // ── Form State ─────────────────────────────────────────────────────────────
  const [name, setName]                     = useState(initial.name || '');
  const [species, setSpecies]               = useState(initial.species || 'Dog');
  const [breed, setBreed]                   = useState(initial.breed || '');
  const [age, setAge]                       = useState(initial.age != null ? String(initial.age) : '');
  const [gender, setGender]                 = useState(isEditMode && initial.gender ? normalizeGender(initial.gender) : 'Female');
  const [weight, setWeight]                 = useState(initial.weight ? String(parseFloat(initial.weight)) : '');
  const [weightUnit, setWeightUnit]         = useState('kg');
  const [spayedNeutered, setSpayedNeutered] = useState(initial.spayed_neutered || false);
  const [medicalConditions, setMedicalConditions] = useState(initialMedical.notes);
  const [allergies, setAllergies]           = useState(initialMedical.allergyList);
  const [allergyInput, setAllergyInput]     = useState('');
  const [microchipId, setMicrochipId]       = useState(initial.microchip_id || '');
  // Keep any existing photo so saving an edit doesn't wipe avatar_url
  const [avatarUrl, setAvatarUrl]           = useState(initial.avatar_url || null);
  const [avatarError, setAvatarError]       = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    setAvatarError(false);
  }, [avatarUrl]);
  const [loading, setLoading]               = useState(false);
  const [errors, setErrors]                 = useState({});

  // Delete Pet Dialog States (edit mode)
  const [deleteDialogVisible, setDeleteDialogVisible]   = useState(false);
  const [deleting, setDeleting]                         = useState(false);
  const [successDialogVisible, setSuccessDialogVisible] = useState(false);

  const allergyInputRef = useRef(null);

  // ── Photo Picker ───────────────────────────────────────────────────────────
  const handlePickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please allow access to your photo library to set a photo for your pet.'
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
        const pickedAsset = result.assets[0];
        const mimeType =
          pickedAsset.mimeType && pickedAsset.mimeType.startsWith('image/')
            ? pickedAsset.mimeType
            : 'image/jpeg';
        const pickedUri = pickedAsset.base64
          ? `data:${mimeType};base64,${pickedAsset.base64}`
          : pickedAsset.uri;
        setAvatarError(false);
        setAvatarUrl(pickedUri);

        // If editing an existing pet, upload right away
        if (isEditMode && petId) {
          try {
            setUploadingPhoto(true);
            const uploadRes = await api.uploadPetAvatar(petId, pickedUri);
            if (uploadRes.data?.pet?.avatar_url) {
              setAvatarUrl(uploadRes.data.pet.avatar_url);
            }
          } catch (uploadErr) {
            Alert.alert('Upload Error', 'Could not upload pet photo. It will retry when you save.');
          } finally {
            setUploadingPhoto(false);
          }
        }
      }
    } catch (err) {
      Alert.alert('Error', 'An error occurred while choosing a photo.');
    }
  };

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = () => {
    const newErrors = {};
    if (!name.trim()) {
      newErrors.name = 'Pet name is required.';
    } else if (name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters.';
    }
    if (age !== '') {
      const ageNum = Number(age);
      if (isNaN(ageNum) || ageNum < 0 || ageNum > 100) {
        newErrors.age = 'Age must be a number between 0 and 100.';
      }
    }
    if (weight !== '') {
      const weightNum = Number(weight);
      if (isNaN(weightNum) || weightNum <= 0) {
        newErrors.weight = 'Weight must be a positive number.';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ── Allergy helpers ────────────────────────────────────────────────────────
  const addAllergy = () => {
    const trimmed = allergyInput.trim();
    if (!trimmed) return;
    if (!allergies.includes(trimmed)) {
      setAllergies([...allergies, trimmed]);
    }
    setAllergyInput('');
  };

  const removeAllergy = (item) => {
    setAllergies(allergies.filter((a) => a !== item));
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!validate()) return;

    const payload = {
      name: name.trim(),
      species,
      breed: breed.trim() || null,
      age: age ? parseInt(age, 10) : null,
      gender,
      weight: weight ? parseFloat(weight) : null,
      medical_conditions: (medicalConditions + (allergies.length ? " Allergies: " + allergies.join(", ") : "")).trim() || null,
      avatar: avatarUrl || null,
      avatar_url: avatarUrl || null,
    };

    setLoading(true);
    try {
      if (isEditMode) {
        await api.updatePet(petId, payload);
        if (avatarUrl && !avatarUrl.startsWith('http')) {
          try {
            await api.uploadPetAvatar(petId, avatarUrl);
          } catch (uploadErr) {
            console.warn('Avatar upload warning on update:', uploadErr);
          }
        }
        navigation.goBack();
      } else {
        const res = await api.createPet(payload);
        const newPet = res.data?.pet;
        if (newPet?.id && avatarUrl && !avatarUrl.startsWith('http')) {
          try {
            await api.uploadPetAvatar(newPet.id, avatarUrl);
          } catch (uploadErr) {
            console.warn('Avatar upload warning on create:', uploadErr);
          }
        }
        // Navigate back after successful creation
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.replace('MainTabs', { screen: 'Pets' });
        }
      }
    } catch (err) {
      const errorData = err?.response?.data;
      let msg =
        errorData?.message ??
        err?.message ??
        'Something went wrong. Please try again.';
      if (errorData?.errors) {
        const errorDetails = Object.values(errorData.errors).flat().join('\n');
        if (errorDetails) {
          msg = `${msg}\n${errorDetails}`;
        }
      }
      Alert.alert('Could not save pet', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!petId) return;
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

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        Platform.OS === 'web' && { height: windowHeight },
      ]}
      edges={['top']}
    >
      {/* ── 1. Top Bar ────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        {/* Cancel */}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.cancelBtn}
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>

        {/* Center title */}
        <View style={styles.topBarCenter}>
          <Text style={styles.topBarTitle}>{isEditMode ? 'Edit Pet' : 'Add New Pet'}</Text>
          <Text style={styles.topBarSubtitle}>{isEditMode ? 'Update profile' : 'Pet profile'}</Text>
        </View>

        {/* Save pill */}
        <TouchableOpacity
          style={[styles.savePill, loading && styles.savePillDisabled]}
          activeOpacity={0.85}
          onPress={handleSave}
          disabled={loading}
          accessibilityLabel="Save pet"
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Ionicons name="checkmark" size={14} color={colors.white} />
              <Text style={styles.savePillText}>Save</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Scrollable form body ─────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 120 + insets.bottom },
        ]}
        scrollEnabled={true}
        nestedScrollEnabled={true}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bounces={true}
        alwaysBounceVertical={true}
      >

          {/* ── 2. Photo Upload ───────────────────────────────────────── */}
          <View style={styles.photoCard}>
            <TouchableOpacity
              style={styles.photoCircle}
              activeOpacity={0.8}
              onPress={handlePickPhoto}
              disabled={uploadingPhoto}
              accessibilityLabel="Upload pet photo"
            >
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : avatarUrl && !avatarError ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.photoImage}
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <Ionicons name="camera-outline" size={32} color={colors.primaryLight} />
              )}
              {/* Camera badge */}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera-outline" size={12} color={colors.white} />
              </View>
            </TouchableOpacity>
            <Text style={styles.photoLabel}>{avatarUrl ? 'Change Pet Photo' : 'Add Pet Photo'}</Text>
            <Text style={styles.photoHint}>JPG or PNG • Max 4MB</Text>
          </View>

          {/* ── 3. Basic Identity ─────────────────────────────────────── */}
          <View style={styles.formSection}>
            {/* Section header */}
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconCircle}>
                <Ionicons name="person-outline" size={14} color={colors.primary} />
              </View>
              <Text style={styles.sectionTitle}>Basic Identity</Text>
            </View>

            {/* Pet Name */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                Pet Name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[styles.textInput, errors.name && styles.textInputError]}
                placeholder="e.g. Buddy, Luna, Mochi"
                placeholderTextColor={colors.borderDashed}
                value={name}
                onChangeText={(v) => { setName(v); setErrors((e) => ({ ...e, name: undefined })); }}
                autoCapitalize="words"
                returnKeyType="next"
                accessibilityLabel="Pet name input"
              />
              {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
            </View>

            {/* Species chips */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Species</Text>
              <ScrollView
                horizontal
                nestedScrollEnabled={true}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
              >
                {SPECIES_OPTIONS.map((s) => {
                  const isActive = species === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[styles.chip, isActive && styles.chipActive]}
                      activeOpacity={0.8}
                      onPress={() => setSpecies(s)}
                      accessibilityLabel={`Select species ${s}`}
                    >
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                        {s}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Breed */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Breed <Text style={styles.optional}>(optional)</Text></Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Labrador Retriever"
                placeholderTextColor={colors.borderDashed}
                value={breed}
                onChangeText={setBreed}
                autoCapitalize="words"
                returnKeyType="next"
                accessibilityLabel="Breed input"
              />
            </View>

            {/* Birthday / Age */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                Age <Text style={styles.optional}>(years)</Text>
              </Text>
              <View style={styles.inputWithIcon}>
                <TextInput
                  style={[styles.textInput, styles.textInputFlex, errors.age && styles.textInputError]}
                  placeholder="e.g. 3"
                  placeholderTextColor={colors.borderDashed}
                  value={age}
                  onChangeText={(v) => { setAge(v); setErrors((e) => ({ ...e, age: undefined })); }}
                  keyboardType="numeric"
                  returnKeyType="next"
                  accessibilityLabel="Age input"
                />
                <View style={styles.inputIconRight}>
                  <Ionicons name="calendar-outline" size={18} color={colors.borderDashed} />
                </View>
              </View>
              {errors.age && <Text style={styles.errorText}>{errors.age}</Text>}
            </View>
          </View>

          {/* ── 4. Physical & Health Traits ───────────────────────────── */}
          <View style={styles.formSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconCircle}>
                <Ionicons name="fitness-outline" size={14} color={colors.primary} />
              </View>
              <Text style={styles.sectionTitle}>Physical &amp; Health Traits</Text>
            </View>

            {/* Gender toggle */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Gender</Text>
              <View style={styles.segmentedControl}>
                {GENDER_OPTIONS.map((g) => {
                  const isActive = gender === g;
                  return (
                    <TouchableOpacity
                      key={g}
                      style={[styles.segment, isActive && styles.segmentActive]}
                      activeOpacity={0.8}
                      onPress={() => setGender(g)}
                      accessibilityLabel={`Select gender ${g}`}
                    >
                      <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                        {g}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Spayed / Neutered */}
            <View style={styles.fieldGroupRow}>
              <View style={styles.fieldGroupRowText}>
                <Text style={styles.fieldLabel}>Spayed / Neutered</Text>
                <Text style={styles.fieldSubLabel}>
                  {spayedNeutered ? 'Yes' : 'No'}
                </Text>
              </View>
              <Switch
                value={spayedNeutered}
                onValueChange={setSpayedNeutered}
                trackColor={{ false: colors.divider, true: colors.primaryLight }}
                thumbColor={spayedNeutered ? colors.primary : colors.borderDashed}
                accessibilityLabel="Spayed or neutered toggle"
              />
            </View>

            {/* Weight */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Body Weight</Text>
              <View style={styles.weightRow}>
                <TextInput
                  style={[
                    styles.textInput,
                    styles.weightInput,
                    errors.weight && styles.textInputError,
                  ]}
                  placeholder="0.0"
                  placeholderTextColor={colors.borderDashed}
                  value={weight}
                  onChangeText={(v) => { setWeight(v); setErrors((e) => ({ ...e, weight: undefined })); }}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                  accessibilityLabel="Weight input"
                />
                {/* Unit switcher */}
                <View style={styles.unitSwitcher}>
                  {['kg', 'lb'].map((u) => {
                    const isActive = weightUnit === u;
                    return (
                      <TouchableOpacity
                        key={u}
                        style={[styles.unitBtn, isActive && styles.unitBtnActive]}
                        onPress={() => setWeightUnit(u)}
                        accessibilityLabel={`Weight unit ${u}`}
                      >
                        <Text style={[styles.unitBtnText, isActive && styles.unitBtnTextActive]}>
                          {u}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              {errors.weight && <Text style={styles.errorText}>{errors.weight}</Text>}
            </View>
          </View>

          {/* ── 5. Medical Conditions & Allergies ────────────────────── */}
          <View style={styles.formSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconCircle}>
                <Ionicons name="medical-outline" size={14} color={colors.primary} />
              </View>
              <Text style={styles.sectionTitle}>Medical Conditions &amp; Allergies</Text>
            </View>

            {/* Allergy chips */}
            <View style={styles.fieldGroup}>
              <Text style={styles.allergyLabel}>ACTIVE ALERTS &amp; ALLERGIES</Text>

              {/* Existing chips */}
              {allergies.length > 0 && (
                <View style={styles.allergyChipsWrap}>
                  {allergies.map((item, idx) => (
                    <View key={item} style={styles.allergyChip}>
                      <View style={[styles.allergyDot, idx % 2 === 1 && styles.allergyDotAmber]} />
                      <Text style={styles.allergyChipText}>{item}</Text>
                      <TouchableOpacity
                        onPress={() => removeAllergy(item)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        accessibilityLabel={`Remove allergy ${item}`}
                      >
                        <Ionicons name="close-outline" size={14} color={colors.alertRed} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.allergyAddChip}
                    onPress={() => allergyInputRef.current?.focus()}
                    accessibilityLabel="Add allergy chip"
                  >
                    <Ionicons name="add" size={12} color={colors.primary} />
                    <Text style={styles.allergyAddChipText}>Add</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Add allergy input row */}
              <View style={styles.allergyInputRow}>
                <TextInput
                  ref={allergyInputRef}
                  style={[styles.textInput, styles.textInputFlex]}
                  placeholder="Add allergy or condition…"
                  placeholderTextColor={colors.borderDashed}
                  value={allergyInput}
                  onChangeText={setAllergyInput}
                  onSubmitEditing={addAllergy}
                  returnKeyType="done"
                  accessibilityLabel="Allergy input"
                />
                <TouchableOpacity
                  style={styles.allergyAddBtn}
                  onPress={addAllergy}
                  accessibilityLabel="Add allergy"
                >
                  <Ionicons name="add" size={18} color={colors.white} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Medical Notes */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Medical Notes <Text style={styles.optional}>(optional)</Text></Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Any ongoing conditions, treatments, or special notes…"
                placeholderTextColor={colors.borderDashed}
                value={medicalConditions}
                onChangeText={setMedicalConditions}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                returnKeyType="default"
                accessibilityLabel="Medical notes input"
              />
            </View>

            {/* Microchip ID */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Microchip ID <Text style={styles.optional}>(optional)</Text></Text>
              <TextInput
                style={styles.textInput}
                placeholder="15-digit ISO microchip number"
                placeholderTextColor={colors.borderDashed}
                value={microchipId}
                onChangeText={setMicrochipId}
                keyboardType="numeric"
                returnKeyType="done"
                accessibilityLabel="Microchip ID input"
              />
            </View>
          </View>

          {/* Delete Pet CTA (edit mode) */}
          {isEditMode && (
            <TouchableOpacity
              style={styles.deletePetBtn}
              activeOpacity={0.82}
              onPress={() => setDeleteDialogVisible(true)}
              disabled={loading || deleting}
              accessibilityLabel="Delete pet profile"
            >
              <Ionicons name="trash-outline" size={18} color={colors.alertRed} />
              <Text style={styles.deletePetBtnText}>Delete Pet</Text>
            </TouchableOpacity>
          )}

          {/* Bottom spacer */}
          <View style={{ height: spacing.xxxl }} />
        </ScrollView>

      {/* ── Sticky Bottom Bar ────────────────────────────────────────── */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[styles.savePetBtn, loading && styles.savePetBtnDisabled]}
          activeOpacity={0.88}
          onPress={handleSave}
          disabled={loading}
          accessibilityLabel="Save pet profile"
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Ionicons name="paw-outline" size={18} color={colors.white} />
              <Text style={styles.savePetBtnText}>{isEditMode ? 'Save Changes' : 'Save Pet'}</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.white} />
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Confirmation Dialog ────────────────────────────────────────── */}
      <ThemedDialog
        visible={deleteDialogVisible}
        title="Delete Pet"
        message={`Are you sure you want to delete ${name || 'this pet'}? This will also remove their appointments and records.`}
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
        message={`${name || 'Pet'} has been deleted successfully.`}
        type="success"
        confirmText="OK"
        onConfirm={handleSuccessClose}
      />
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

  // ── Top Bar ─────────────────────────────────────────────────────────────
  topBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  cancelBtn: {
    paddingVertical: spacing.sm,
    paddingRight: spacing.sm,
  },
  cancelText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  topBarCenter: {
    alignItems: 'center',
    gap: 1,
  },
  topBarTitle: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  topBarSubtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  savePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingVertical: 7,
    paddingHorizontal: spacing.base,
    borderRadius: 9999,
    minWidth: 64,
    justifyContent: 'center',
  },
  savePillDisabled: {
    opacity: 0.6,
  },
  savePillText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.white,
  },

  // ── Scroll ──────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },

  // ── Photo Upload Card ────────────────────────────────────────────────────
  photoCard: {
    backgroundColor: colors.cardWarm,
    borderRadius: radii.lg,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.base,
  },
  photoCircle: {
    width: 112,
    height: 112,
    borderRadius: 9999,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primaryLight,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 9999,
  },
  photoPlaceholder: {
    fontSize: 40,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 9999,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.white,
    zIndex: 2,
  },
  photoLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  photoHint: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },

  // ── Form Section ─────────────────────────────────────────────────────────
  formSection: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.base,
    gap: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.base,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  sectionIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 9999,
    backgroundColor: colors.primaryPale,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },

  // ── Field ────────────────────────────────────────────────────────────────
  fieldGroup: {
    gap: spacing.xs,
  },
  fieldGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  fieldGroupRowText: {
    gap: 2,
  },
  fieldLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
  },
  fieldSubLabel: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  required: {
    color: colors.alertRed,
  },
  optional: {
    fontFamily: fonts.bodyRegular,
    color: colors.textMuted,
  },
  textInput: {
    backgroundColor: colors.cardWarm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    height: 46,
  },
  textInputFlex: {
    flex: 1,
  },
  textInputError: {
    borderColor: colors.alertRed,
  },
  textArea: {
    height: 96,
    paddingTop: spacing.sm + 2,
  },
  errorText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.alertRed,
  },
  inputWithIcon: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputIconRight: {
    position: 'absolute',
    right: spacing.base,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },

  // ── Species / Generic Chips ───────────────────────────────────────────────
  chipsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: spacing.base,
    borderRadius: 9999,
    backgroundColor: colors.cardWarm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.white,
  },

  // ── Gender Segmented Control ───────────────────────────────────────────────
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.cardWarm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.white,
  },

  // ── Weight Row ────────────────────────────────────────────────────────────
  weightRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  weightInput: {
    flex: 1,
  },
  unitSwitcher: {
    flexDirection: 'row',
    backgroundColor: colors.cardWarm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: 'hidden',
  },
  unitBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    alignItems: 'center',
  },
  unitBtnActive: {
    backgroundColor: colors.primary,
  },
  unitBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  unitBtnTextActive: {
    color: colors.white,
  },

  // ── Allergies ─────────────────────────────────────────────────────────────
  allergyLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  allergyChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  allergyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.alertRedLight,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors.alertRed + '44',
  },
  allergyDot: {
    width: 7,
    height: 7,
    borderRadius: 9999,
    backgroundColor: colors.alertRed,
  },
  allergyDotAmber: {
    backgroundColor: colors.amber,
  },
  allergyChipText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs,
    color: colors.alertRedDark,
  },
  allergyAddChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.cardWarm,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: 9999,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primaryLight,
  },
  allergyAddChipText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs,
    color: colors.primary,
  },
  allergyInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  allergyAddBtn: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },

  // ── Sticky Bottom Bar ────────────────────────────────────────────────────
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
  },
  savePetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: spacing.base,
    shadowColor: colors.primaryDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  savePetBtnDisabled: {
    opacity: 0.6,
  },
  savePetBtnText: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.lg,
    color: colors.white,
  },
  deletePetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: '#FFDAD8', // colors.alertRedLight
    borderWidth: 1,
    borderColor: 'rgba(184, 50, 48, 0.3)',
    marginTop: spacing.md,
  },
  deletePetBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: '#B83230', // colors.alertRed
  },
});

export default AddPetScreen;
