/**
 * ProfileScreen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook — Profile (tab)
 *
 * Sections:
 *  1. Top bar        — "Profile" | edit icon
 *  2. Profile card   — avatar + camera badge, name, email, "Verified Member" pill
 *  3. Account        — Edit Profile Modal, Change Password Modal
 *  4. Support & Legal— Contact Clinic, FAQs Modal, Privacy & Pet Rights Modal,
 *                      Terms & Conditions Modal, About VetBook Modal
 *  5. Logout         — Themed confirmation dialog
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Linking,
  ActivityIndicator,
  Modal,
  TextInput,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { colors, fonts, fontSizes, spacing, radii, shadows } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import api, { uploadUserAvatar, sendTestPushNotification } from '../services/api';
import ThemedDialog from '../components/ThemedDialog';

// ─── Constants ───────────────────────────────────────────────────────────────

const CLINIC_PHONE = '+63 917 123 4567';

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

const FAQS = [
  {
    id: 1,
    q: 'How do I book an appointment for my pet?',
    a: 'Navigate to the Appointments tab and tap "Book Now", or view any pet in your profile and select "Book Appointment". Select your branch, chosen date, and preferred time slot.',
  },
  {
    id: 2,
    q: 'What is the clinic cancellation and reschedule policy?',
    a: 'You can reschedule or cancel visits anytime from the My Appointments screen while the status is Pending or Approved. We appreciate cancellations at least 2 hours before your visit so other pets in need may take the slot.',
  },
  {
    id: 3,
    q: 'What core vaccinations does my pet need?',
    a: 'Dogs typically require 5-in-1 / 6-in-1 core vaccines, Rabies, and Kennel Cough. Cats require 4-in-1 feline core vaccines and Rabies. Our clinic staff will evaluate your pet during consultation and prepare an individualized vaccination card.',
  },
  {
    id: 4,
    q: 'What should I do in case of a pet emergency?',
    a: 'In emergencies (heavy bleeding, poisoning, breathing distress, sudden collapse), proceed immediately to our nearest branch or call us directly at +63 917 123 4567. Inform clinic staff in advance so emergency treatment can be prepped.',
  },
  {
    id: 5,
    q: 'What are the operating hours for Mabini and Batangas City branches?',
    a: 'Both branches operate Monday to Saturday from 9:00 AM to 6:00 PM, and Sundays from 10:00 AM to 4:00 PM. Holiday schedules are announced in advance through in-app notifications.',
  },
  {
    id: 6,
    q: 'Can I view my pet’s medical history digitally?',
    a: 'Yes! Every consultation, prescription, treatment, and administered vaccination entered by clinic staff is synced directly to your pet’s digital health passport in VetBook.',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getInitials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || 'V';

// ─── Reusable Row Components ─────────────────────────────────────────────────

const SectionHeader = ({ title }) => (
  <View style={styles.sectionHeader}>
    <View style={styles.sectionBar} />
    <Text style={styles.sectionTitle}>{title}</Text>
  </View>
);

const Row = ({ icon, label, onPress, right, last, disabled }) => (
  <TouchableOpacity
    style={[styles.row, !last && styles.rowBorder]}
    onPress={onPress}
    activeOpacity={onPress ? 0.7 : 1}
    disabled={disabled || !onPress}
    accessibilityLabel={label}
  >
    <View style={styles.rowIcon}>
      <Ionicons name={icon} size={18} color={colors.primary} />
    </View>
    <Text style={styles.rowLabel}>{label}</Text>
    {right ?? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
  </TouchableOpacity>
);

// ─── Screen ──────────────────────────────────────────────────────────────────

const ProfileScreen = () => {
  const auth = useAuth();
  const { user } = auth;
  const { syncPushToken } = useNotification();

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [testingPush, setTestingPush] = useState(false);

  // Modal visibilities
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
  const [faqModalVisible, setFaqModalVisible] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);
  const [aboutModalVisible, setAboutModalVisible] = useState(false);

  // Form states
  const [profileName, setProfileName] = useState(user?.name || user?.user?.name || '');
  const [profilePhone, setProfilePhone] = useState(user?.phone_number || user?.user?.phone_number || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [branches, setBranches] = useState(DEFAULT_CLINIC_BRANCHES);
  const [clinic, setClinic] = useState({
    name: 'BK Petaholic Animal Clinic',
    tagline: 'Compassionate Care for Batangas Pets',
    email: 'info@bkpetaholic.com',
    accreditation: 'BAI-RVD-2024-0089',
    logo_url: null,
  });
  const [logoLoadError, setLogoLoadError] = useState(false);
  const [contactModalVisible, setContactModalVisible] = useState(false);

  // ── Fetch Branches ─────────────────────────────────────────────────────────
  const fetchBranches = useCallback(async () => {
    try {
      const res = await api.getBranches();
      const list = res.data?.data;
      if (Array.isArray(list) && list.length > 0) {
        setBranches(list);
      }
      if (res.data?.clinic) {
        setLogoLoadError(false);
        setClinic((prev) => ({
          ...prev,
          ...res.data.clinic,
        }));
      }
    } catch (err) {
      console.warn('Could not refresh clinic branch info:', err.message);
    }
  }, []);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  useFocusEffect(
    useCallback(() => {
      fetchBranches();
    }, [fetchBranches])
  );

  // Accordion state for FAQs
  const [expandedFaqId, setExpandedFaqId] = useState(null);

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

  const displayName = user?.name || user?.user?.name || 'VetBook User';
  const email = user?.email || user?.user?.email || '';

  // ── Avatar Pick & Upload ───────────────────────────────────────────────────

  const handlePickAvatar = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        showDialog('Permission Needed', 'Please allow photo gallery access to update your avatar.', 'error');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (pickerResult.canceled || !pickerResult.assets?.[0]?.uri) {
        return;
      }

      const asset = pickerResult.assets[0];
      const imageUri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
      setUploadingAvatar(true);

      const res = await uploadUserAvatar(imageUri);
      const newAvatarUrl = res.data?.avatar_url || res.data?.user?.avatar_url;

      if (auth.updateUserState) {
        auth.updateUserState({ avatar_url: newAvatarUrl });
      } else {
        auth.refreshUser?.();
      }

      showDialog('Success', 'Profile photo updated successfully!', 'success');
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to upload photo.';
      showDialog('Upload Failed', msg, 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ── Profile Updates ────────────────────────────────────────────────────────

  const handleOpenEditProfile = () => {
    setProfileName(user?.name || user?.user?.name || '');
    setProfilePhone(user?.phone_number || user?.user?.phone_number || '');
    setEditProfileVisible(true);
  };

  const handleSaveProfile = async () => {
    const trimmedName = profileName.trim();
    const trimmedPhone = profilePhone.trim();

    if (!trimmedName) {
      showDialog('Validation', 'Please enter your full name.', 'error');
      return;
    }

    if (!trimmedPhone || !/^09\d{9}$/.test(trimmedPhone)) {
      showDialog(
        'Validation',
        'Please enter a valid 11-digit Philippine mobile number starting with 09 (e.g. 09171234567).',
        'error'
      );
      return;
    }

    setSavingProfile(true);
    try {
      const res = await api.updateProfile({
        name: trimmedName,
        phone_number: trimmedPhone,
      });
      if (res.data?.user) {
        auth.updateUserState?.(res.data.user);
      }
      setEditProfileVisible(false);
      showDialog('Profile Updated', 'Your profile details have been saved successfully.', 'success');
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update profile. Please try again.';
      showDialog('Update Failed', msg, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  // ── Password Updates ───────────────────────────────────────────────────────

  const handleOpenChangePassword = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setChangePasswordVisible(true);
  };

  const handleSavePassword = async () => {
    if (!currentPassword) {
      showDialog('Validation', 'Please enter your current password.', 'error');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      showDialog('Validation', 'New password must be at least 6 characters.', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      showDialog('Validation', 'New password and confirmation do not match.', 'error');
      return;
    }

    setSavingPassword(true);
    try {
      await api.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirmation: confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setChangePasswordVisible(false);
      showDialog('Success', 'Your password has been changed successfully.', 'success');
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.errors?.current_password?.[0] || 'Password update failed.';
      showDialog('Error', msg, 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  // ── Support & Clinic Contact ───────────────────────────────────────────────

  const handleDialBranch = async (branch) => {
    const dialUrl = branch?.dialUrl || `tel:${(branch?.phone || CLINIC_PHONE).replace(/[^0-9+]/g, '')}`;
    try {
      await Linking.openURL(dialUrl);
    } catch (err) {
      showDialog('Phone Call', `Unable to open phone dialer. You can call ${branch?.phone || CLINIC_PHONE} directly.`, 'error');
    }
  };

  const handleContactClinic = () => {
    if (branches && branches.length > 1) {
      setContactModalVisible(true);
    } else if (branches && branches.length === 1) {
      const b = branches[0];
      showConfirm({
        title: 'Contact Clinic',
        message: `Call BK Petaholic Animal Clinic (${b.name}) at ${b.phone}?`,
        confirmLabel: 'Call Now',
        onConfirm: () => handleDialBranch(b),
      });
    } else {
      showConfirm({
        title: 'Contact Clinic',
        message: `Call BK Petaholic Animal Clinic at ${CLINIC_PHONE}?`,
        confirmLabel: 'Call Now',
        onConfirm: () => Linking.openURL(`tel:${CLINIC_PHONE.replace(/[^0-9+]/g, '')}`).catch(() => {}),
      });
    }
  };

  const handleTestPushNotification = async () => {
    if (testingPush) return;
    setTestingPush(true);
    try {
      // 1. Ensure push token is active and synced with the backend (pass true for user gesture on web)
      await syncPushToken?.(true);

      // 2. Dispatch test push from backend
      const res = await sendTestPushNotification();
      showDialog(
        'Push Dispatched 🐾',
        res.data?.message || 'A test push notification has been sent! Lock your screen or background the app to see it appear.',
        'success'
      );
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to dispatch test notification. Please make sure notifications are enabled in your device settings.';
      showDialog('Push Notification', msg, 'error');
    } finally {
      setTestingPush(false);
    }
  };

  const handleLogout = () => {
    showConfirm({
      title: 'Log out',
      message: 'Are you sure you want to log out of your VetBook account?',
      confirmLabel: 'Log out',
      destructive: true,
      onConfirm: () => auth.logout(),
    });
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── 1. Top bar ───────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <Text style={styles.title}>Profile</Text>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={handleOpenEditProfile}
          accessibilityLabel="Edit profile"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="create-outline" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── 2. Profile card ────────────────────────────────────────────── */}
        <View style={styles.profileCard}>
          <TouchableOpacity
            style={styles.avatarWrap}
            onPress={handlePickAvatar}
            disabled={uploadingAvatar}
            activeOpacity={0.8}
            accessibilityLabel="Change profile picture"
          >
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitials}>{getInitials(displayName)}</Text>
              </View>
            )}
            {uploadingAvatar ? (
              <View style={[styles.avatar, styles.avatarLoadingOverlay]}>
                <ActivityIndicator size="small" color={colors.white} />
              </View>
            ) : (
              <View style={styles.editBadge}>
                <Ionicons name="camera" size={14} color={colors.white} />
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.name}>{displayName}</Text>
          {!!email && <Text style={styles.email}>{email}</Text>}
          {!!(user?.phone_number || user?.user?.phone_number) && (
            <Text style={styles.phone}>{user?.phone_number || user?.user?.phone_number}</Text>
          )}

          <View style={styles.verifiedPill}>
            <Ionicons name="shield-checkmark" size={14} color={colors.amberDark} />
            <Text style={styles.verifiedText}>Verified Pet Owner</Text>
          </View>
        </View>

        {/* ── 3. Account ─────────────────────────────────────────────────── */}
        <SectionHeader title="Account" />
        <View style={styles.sectionCard}>
          <Row icon="person-outline" label="Edit Profile" onPress={handleOpenEditProfile} />
          <Row icon="lock-closed-outline" label="Change Password" onPress={handleOpenChangePassword} last />
        </View>

        {/* ── 4. Notifications & Diagnostics ─────────────────────────────── */}
        <SectionHeader title="Notifications" />
        <View style={styles.sectionCard}>
          <Row
            icon="notifications-outline"
            label="Test Push Notification"
            onPress={handleTestPushNotification}
            disabled={testingPush}
            right={
              testingPush ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : undefined
            }
            last
          />
        </View>

        {/* ── 5. Support & Legal ─────────────────────────────────────────── */}
        <SectionHeader title="Support & Legal" />
        <View style={styles.sectionCard}>
          <Row icon="call-outline" label="Contact Clinic" onPress={handleContactClinic} />
          <Row icon="help-circle-outline" label="Frequently Asked Questions" onPress={() => setFaqModalVisible(true)} />
          <Row icon="shield-checkmark-outline" label="Privacy Policy & Pet Rights" onPress={() => setPrivacyModalVisible(true)} />
          <Row icon="document-text-outline" label="Terms & Conditions" onPress={() => setTermsModalVisible(true)} />
          <Row icon="information-circle-outline" label="About VetBook & Clinic" onPress={() => setAboutModalVisible(true)} last />
        </View>

        {/* ── 5. Logout ──────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.8}
          accessibilityLabel="Log out"
        >
          <Ionicons name="log-out-outline" size={20} color={colors.alertRed} />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 1: Edit Profile                                                */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <Modal visible={editProfileVisible} transparent animationType="slide" onRequestClose={() => setEditProfileVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Edit Profile</Text>
                <Text style={styles.sheetSub}>Update your personal details</Text>
              </View>
              <TouchableOpacity onPress={() => setEditProfileVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Maria Santos"
                placeholderTextColor={colors.borderDashed}
                value={profileName}
                onChangeText={setProfileName}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Mobile Number</Text>
              <TextInput
                style={styles.input}
                placeholder="09XXXXXXXXX"
                placeholderTextColor={colors.borderDashed}
                value={profilePhone}
                onChangeText={setProfilePhone}
                keyboardType="phone-pad"
                maxLength={11}
              />
              <Text style={styles.hintText}>Used for appointment confirmation and vaccine reminder texts.</Text>
            </View>

            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.cancelActionBtn} onPress={() => setEditProfileVisible(false)}>
                <Text style={styles.cancelActionText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveActionBtn, savingProfile && styles.btnDisabled]}
                onPress={handleSaveProfile}
                disabled={savingProfile}
              >
                {savingProfile ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.saveActionText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 2: Change Password                                             */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <Modal visible={changePasswordVisible} transparent animationType="slide" onRequestClose={() => setChangePasswordVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Change Password</Text>
                <Text style={styles.sheetSub}>Keep your account secure</Text>
              </View>
              <TouchableOpacity onPress={() => setChangePasswordVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Current Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter current password"
                placeholderTextColor={colors.borderDashed}
                secureTextEntry
                value={currentPassword}
                onChangeText={setCurrentPassword}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>New Password</Text>
              <TextInput
                style={styles.input}
                placeholder="At least 6 characters"
                placeholderTextColor={colors.borderDashed}
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Confirm New Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Repeat new password"
                placeholderTextColor={colors.borderDashed}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            </View>

            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.cancelActionBtn} onPress={() => setChangePasswordVisible(false)}>
                <Text style={styles.cancelActionText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveActionBtn, savingPassword && styles.btnDisabled]}
                onPress={handleSavePassword}
                disabled={savingPassword}
              >
                {savingPassword ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.saveActionText}>Update Password</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 3: FAQs                                                        */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <Modal visible={faqModalVisible} transparent animationType="slide" onRequestClose={() => setFaqModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheetContainer, styles.sheetContainerLarge]}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderLeft}>
                <View style={styles.headerIconBadge}>
                  <Ionicons name="help-circle" size={20} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.sheetTitle}>Frequently Asked Questions</Text>
                  <Text style={styles.sheetSub}>Quick answers to clinic services</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setFaqModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {FAQS.map((faq) => {
                const isOpen = expandedFaqId === faq.id;
                return (
                  <View key={faq.id} style={styles.faqCard}>
                    <TouchableOpacity
                      style={styles.faqQuestionRow}
                      onPress={() => setExpandedFaqId(isOpen ? null : faq.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.faqQuestion}>{faq.q}</Text>
                      <Ionicons
                        name={isOpen ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colors.primary}
                      />
                    </TouchableOpacity>
                    {isOpen && (
                      <View style={styles.faqAnswerWrap}>
                        <Text style={styles.faqAnswer}>{faq.a}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 5: Privacy Policy & Pet Rights under PH Law                   */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <Modal visible={privacyModalVisible} transparent animationType="slide" onRequestClose={() => setPrivacyModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheetContainer, styles.sheetContainerLarge]}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderLeft}>
                <View style={styles.headerIconBadge}>
                  <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.sheetTitle}>Privacy & Pet Rights</Text>
                  <Text style={styles.sheetSub}>Philippine Animal Welfare & Data Laws</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setPrivacyModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {/* Pet Rights Banner */}
              <View style={styles.phLawCard}>
                <View style={styles.phLawBadge}>
                  <Ionicons name="paw" size={16} color={colors.white} />
                  <Text style={styles.phLawBadgeText}>PHILIPPINE LAW</Text>
                </View>
                <Text style={styles.phLawTitle}>Republic Act No. 8485 &amp; RA 10631</Text>
                <Text style={styles.phLawSub}>The Animal Welfare Act of 1998, as amended</Text>
                <Text style={styles.phLawBody}>
                  Under Philippine law, all animals possess inherent rights to compassionate care, nourishment, and freedom from neglect, cruelty, and torture. BK Petaholic Animal Clinic upholds the Five Freedoms of Animal Welfare as core clinic standards:
                </Text>

                <View style={styles.freedomsList}>
                  <View style={styles.freedomItem}>
                    <Ionicons name="water-outline" size={16} color={colors.primary} />
                    <Text style={styles.freedomText}><Text style={styles.bold}>1. Freedom from Hunger &amp; Thirst:</Text> Readily available clean water and diet maintaining full health.</Text>
                  </View>
                  <View style={styles.freedomItem}>
                    <Ionicons name="home-outline" size={16} color={colors.primary} />
                    <Text style={styles.freedomText}><Text style={styles.bold}>2. Freedom from Discomfort:</Text> An appropriate sheltered environment and comfortable rest.</Text>
                  </View>
                  <View style={styles.freedomItem}>
                    <Ionicons name="medkit-outline" size={16} color={colors.primary} />
                    <Text style={styles.freedomText}><Text style={styles.bold}>3. Freedom from Pain, Injury &amp; Disease:</Text> Prompt clinical diagnostics, treatment, and preventive care.</Text>
                  </View>
                  <View style={styles.freedomItem}>
                    <Ionicons name="happy-outline" size={16} color={colors.primary} />
                    <Text style={styles.freedomText}><Text style={styles.bold}>4. Freedom from Fear &amp; Distress:</Text> Humane conditions and gentle handling avoiding mental trauma.</Text>
                  </View>
                  <View style={styles.freedomItem}>
                    <Ionicons name="football-outline" size={16} color={colors.primary} />
                    <Text style={styles.freedomText}><Text style={styles.bold}>5. Freedom to Express Normal Behavior:</Text> Sufficient space and proper environmental enrichment.</Text>
                  </View>
                </View>

                <View style={styles.lawNote}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.alertRed} />
                  <Text style={styles.lawNoteText}>
                    Abandonment, physical abuse, and failure to provide essential medical care carry criminal penalties, fines, and imprisonment under RA 10631.
                  </Text>
                </View>
              </View>

              {/* Data Privacy Section */}
              <View style={styles.contentSection}>
                <Text style={styles.contentSectionTitle}>Data Privacy Act (RA 10173)</Text>
                <Text style={styles.contentBody}>
                  VetBook protects your personal information in strict compliance with the Data Privacy Act of 2012. Owner contact numbers, email addresses, and visit records are stored securely and used solely for appointment logistics, medical updates, and clinical reminders. We never share or sell personal data to third parties.
                </Text>
              </View>

              {/* Clinical Consent */}
              <View style={styles.contentSection}>
                <Text style={styles.contentSectionTitle}>Medical Confidentiality</Text>
                <Text style={styles.contentBody}>
                  Your pet’s health history, diagnostic results, and treatment plans are maintained under professional confidentiality. Records are accessible by you and authorized BK Petaholic clinic medical officers.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 6: Terms & Conditions                                          */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <Modal visible={termsModalVisible} transparent animationType="slide" onRequestClose={() => setTermsModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheetContainer, styles.sheetContainerLarge]}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderLeft}>
                <View style={styles.headerIconBadge}>
                  <Ionicons name="document-text" size={20} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.sheetTitle}>Terms &amp; Conditions</Text>
                  <Text style={styles.sheetSub}>Clinic policies and booking guidelines</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setTermsModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.contentSection}>
                <Text style={styles.contentSectionTitle}>1. Appointments &amp; Punctuality</Text>
                <Text style={styles.contentBody}>
                  Please arrive 10 to 15 minutes before your confirmed appointment slot. Because clinic capacity is managed to prevent overcrowding and pet stress, slots are held for up to 15 minutes before being released to walk-in patients.
                </Text>
              </View>

              <View style={styles.contentSection}>
                <Text style={styles.contentSectionTitle}>2. Safety &amp; Restraint</Text>
                <Text style={styles.contentBody}>
                  For the safety of all patients and clients, all dogs must be securely leashed at all times within clinic premises, and cats must be transported in well-ventilated pet carriers. If your pet is aggressive or reactive, kindly notify the front desk upon arrival.
                </Text>
              </View>

              <View style={styles.contentSection}>
                <Text style={styles.contentSectionTitle}>3. Emergency Triage</Text>
                <Text style={styles.contentBody}>
                  Our clinic staff reserves the right to prioritize critical, life-threatening emergency cases over non-urgent scheduled appointments. We appreciate your understanding and patience during unexpected emergency procedures.
                </Text>
              </View>

              <View style={styles.contentSection}>
                <Text style={styles.contentSectionTitle}>4. Payment &amp; Fees</Text>
                <Text style={styles.contentBody}>
                  Consultation, procedure, and laboratory fees are settled at the clinic reception following the visit. Payment can be made in cash, GCash, or Maya. Itemized receipts and medical summaries are provided upon discharge.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 7: About VetBook & Clinic                                      */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <Modal visible={aboutModalVisible} transparent animationType="slide" onRequestClose={() => setAboutModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheetContainer, styles.sheetContainerLarge]}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderLeft}>
                <View style={styles.headerIconBadge}>
                  <Ionicons name="information-circle" size={20} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.sheetTitle}>About VetBook</Text>
                  <Text style={styles.sheetSub}>BK Petaholic Animal Clinic</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setAboutModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {/* Clinic Banner */}
              <View style={styles.aboutClinicCard}>
                {clinic.logo_url && !logoLoadError ? (
                  <Image
                    source={{ uri: clinic.logo_url }}
                    style={styles.aboutClinicLogo}
                    resizeMode="cover"
                    onError={() => setLogoLoadError(true)}
                  />
                ) : (
                  <Image
                    source={require('../../assets/icon.png')}
                    style={styles.aboutClinicLogo}
                    resizeMode="cover"
                  />
                )}
                <Text style={styles.aboutClinicName}>{clinic.name || 'BK Petaholic Animal Clinic'}</Text>
                <Text style={styles.aboutClinicTagline}>{clinic.tagline || 'Compassionate Care for Batangas Pets'}</Text>

                {clinic.email ? (
                  <View style={styles.aboutInfoRow}>
                    <Ionicons name="mail" size={15} color={colors.primary} />
                    <Text style={styles.aboutInfoText}>{clinic.email}</Text>
                  </View>
                ) : null}

                {clinic.accreditation ? (
                  <View style={styles.aboutBadgeRow}>
                    <Ionicons name="ribbon" size={15} color={colors.amberDark} />
                    <Text style={styles.aboutBadgeText}>License: {clinic.accreditation}</Text>
                  </View>
                ) : null}

                {branches.map((b) => (
                  <View key={b.id} style={styles.branchBox}>
                    <Ionicons name="location" size={16} color={colors.primary} />
                    <View style={styles.branchBoxText}>
                      <Text style={styles.branchBoxTitle}>{b.name}</Text>
                      <Text style={styles.branchBoxDesc}>{b.address}</Text>
                      {b.hoursWeekday ? (
                        <Text style={styles.branchBoxHours}>{b.hoursWeekday}{b.hoursSunday ? ` | ${b.hoursSunday}` : ''}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>

              {/* Capstone Credits */}
              <View style={styles.capstoneCard}>
                <View style={styles.capstoneBadge}>
                  <Ionicons name="school-outline" size={14} color={colors.amberDark} />
                  <Text style={styles.capstoneBadgeText}>ACADEMIC CAPSTONE INITIATIVE</Text>
                </View>
                <Text style={styles.capstoneTitle}>Batangas State University</Text>
                <Text style={styles.capstoneSub}>The National Engineering University</Text>
                <Text style={styles.capstoneDesc}>
                  VetBook is proudly conceptualized and engineered in collaboration with the College of Informatics and Computing Sciences at Batangas State University. This capstone initiative aims to modernize clinical workflows and enhance community pet healthcare throughout the province of Batangas.
                </Text>
                <View style={styles.versionRow}>
                  <Text style={styles.versionText}>Version 1.0.0 (Expo SDK 58)</Text>
                  <Text style={styles.versionText}>• 2026 VetBook</Text>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: Contact Clinic / Branch Picker                                */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <Modal
        visible={contactModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setContactModalVisible(false)}
      >
        <View style={styles.callModalOverlay}>
          <View style={styles.callModalCard}>
            {/* Header */}
            <View style={styles.callModalHeader}>
              <View style={styles.callModalHeaderLeft}>
                <View style={styles.callModalIconCircle}>
                  <Ionicons name="call" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.callModalTitle}>Contact BK Petaholic</Text>
                  <Text style={styles.callModalSubtitle}>Select a branch to open phone dialer</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setContactModalVisible(false)}
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
                  key={b.id || b.name}
                  style={styles.callOptionCard}
                  activeOpacity={0.82}
                  onPress={() => {
                    setContactModalVisible(false);
                    handleDialBranch(b);
                  }}
                  accessibilityLabel={`Call ${b.name} at ${b.phone}`}
                >
                  <View style={styles.callOptionContent}>
                    <View style={styles.callOptionTitleRow}>
                      <Ionicons name="location" size={15} color={colors.primary} />
                      <Text style={styles.callOptionBranchName}>{b.name}</Text>
                    </View>
                    <Text style={styles.callOptionAddress}>{b.addressSummary || b.address}</Text>
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
              onPress={() => setContactModalVisible(false)}
              accessibilityLabel="Cancel"
            >
              <Text style={styles.callModalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Themed Custom Alert / Confirmation Popup */}
      <ThemedDialog {...dialog} />
    </SafeAreaView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const AVATAR = 100;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    paddingBottom: spacing.md,
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

  // Profile Card
  profileCard: {
    backgroundColor: colors.cardWarm,
    borderRadius: radii.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.base,
    alignItems: 'center',
    marginBottom: spacing.xl,
    ...shadows.card,
  },
  avatarWrap: {
    width: AVATAR,
    height: AVATAR,
    position: 'relative',
    marginBottom: spacing.md,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
  },
  avatarFallback: {
    backgroundColor: colors.primaryPale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.hero,
    color: colors.primaryDeep,
  },
  editBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.subtle,
  },
  avatarLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.xxl,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  email: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  phone: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.textTertiary,
    marginTop: 2,
    textAlign: 'center',
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.amberLight,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    marginTop: spacing.md,
  },
  verifiedText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body,
    color: colors.amberDark,
  },

  // Sections
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionBar: {
    width: 4,
    height: 16,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginRight: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.lg,
    color: colors.textPrimary,
  },
  sectionCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.base,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.soft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    paddingVertical: spacing.sm,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.cardWarm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rowLabel: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },

  // Logout
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.alertRed,
    borderRadius: radii.lg,
    paddingVertical: spacing.base,
    marginTop: spacing.sm,
    backgroundColor: colors.white,
  },
  logoutText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.alertRed,
  },

  // Modals & Bottom Sheets
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(46, 50, 48, 0.45)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheetContainer: {
    width: '100%',
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    ...shadows.elevated,
  },
  sheetContainerLarge: {
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  sheetHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  headerIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primaryPale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.xl,
    color: colors.textPrimary,
  },
  sheetSub: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.cardWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formGroup: {
    marginBottom: spacing.base,
  },
  fieldLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.cardWarm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radii.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  hintText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 4,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  cancelActionBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.cardWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelActionText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  saveActionBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  saveActionText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: colors.white,
  },
  btnDisabled: {
    opacity: 0.6,
  },

  // Modal Scroll Content
  modalScroll: {
    maxHeight: 460,
  },
  faqCard: {
    backgroundColor: colors.cardWarm,
    borderRadius: radii.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  faqQuestionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  faqQuestion: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    flex: 1,
  },
  faqAnswerWrap: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  faqAnswer: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },

  // Philippine Pet Rights Card
  phLawCard: {
    backgroundColor: '#F5FAF6',
    borderRadius: radii.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    marginBottom: spacing.lg,
  },
  phLawBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    marginBottom: spacing.xs,
  },
  phLawBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.white,
    letterSpacing: 0.5,
  },
  phLawTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.lg,
    color: colors.primaryDeep,
    marginBottom: 2,
  },
  phLawSub: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  phLawBody: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  freedomsList: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  freedomItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  freedomText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 18,
  },
  bold: {
    fontFamily: fonts.bodyBold,
    color: colors.primaryDeep,
  },
  lawNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.alertRedLight,
    padding: spacing.sm,
    borderRadius: radii.md,
  },
  lawNoteText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.alertRedDark,
    flex: 1,
    lineHeight: 16,
  },
  contentSection: {
    marginBottom: spacing.lg,
  },
  contentSectionTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.lg,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  contentBody: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },

  // About Clinic Box
  aboutClinicCard: {
    backgroundColor: colors.cardWarm,
    borderRadius: radii.xl,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  aboutPawCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primaryPale,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  aboutClinicLogo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.borderLight,
    marginBottom: spacing.sm,
  },
  aboutClinicName: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.xl,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  aboutClinicTagline: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  aboutInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 6,
  },
  aboutInfoText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  aboutBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.amberPale,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.full,
    marginBottom: spacing.base,
  },
  aboutBadgeText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
    color: colors.amberDark,
  },
  branchBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radii.md,
    width: '100%',
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  branchBoxText: {
    flex: 1,
  },
  branchBoxTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
  },
  branchBoxDesc: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  branchBoxHours: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
  },
  hoursText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Capstone Card
  capstoneCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.lg,
  },
  capstoneBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.amberLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    marginBottom: spacing.xs,
  },
  capstoneBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.amberDark,
    letterSpacing: 0.5,
  },
  capstoneTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.lg,
    color: colors.textPrimary,
  },
  capstoneSub: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  capstoneDesc: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
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
    backgroundColor: colors.background,
    borderRadius: radii.xl,
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
    backgroundColor: colors.cardWarm,
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

  versionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.sm,
  },
  versionText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
});

export default ProfileScreen;
