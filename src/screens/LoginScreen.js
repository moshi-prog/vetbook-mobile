/**
 * LoginScreen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook — Sign In Screen
 *
 * Figma spec:
 *  • Background: #FAF6F0
 *  • Top app bar (72 px): back arrow | VetBook logo + leaf+paw icon | help icon
 *  • Pill badge: "TRUSTED VETERINARY CARE" — bg #F0E8DB, text #705C30, 12 px
 *  • Heading: "Welcome back" — Literata 30 px bold, #2E3230, centered
 *  • Subtitle: Nunito Sans 14 px, #4A4E4A, centered
 *  • Form card: rgba(255,255,255,0.8), radius 24 px, padding 24 px
 *      – Email + Password fields (icons, labels, error states)
 *      – Eye toggle on password
 *      – "Forgot password?" right-aligned green link
 *      – "Login" CTA button — #4A7C59, h 56 px, radius 24 px
 *  • Trust note: shield icon + HIPAA-compliance text
 *  • Footer: "Don't have an account? Sign Up"
 *
 * Navigation:
 *  • Back arrow      → goBack()
 *  • Login success   → reset to 'MainTabs' (no back-stack return)
 *  • Sign Up link    → navigate('Register')
 *  • Forgot password → Reset Password Modal verification flow
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, fontSizes, spacing, radii } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import api, { getBranches } from '../services/api';
import { getClinicInfo, saveClinicInfo } from '../services/storage';
import TermsModal from '../components/TermsModal';

// ─── Validation helpers ───────────────────────────────────────────────────────
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^09\d{9}$/;

// ─────────────────────────────────────────────────────────────────────────────

const LoginScreen = ({ navigation }) => {
  const { login } = useAuth();

  // ── Form values ────────────────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // ── UI state ───────────────────────────────────────────────────────────────
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // ── Per-field errors ───────────────────────────────────────────────────────
  const [emailError, setEmailError] = useState(null);
  const [passwordError, setPasswordError] = useState(null);

  // ── Forgot password modal state ───────────────────────────────────────────
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetPhone, setResetPhone] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState(null);

  // ── Dynamic clinic branding ────────────────────────────────────────────────
  const [clinic, setClinic] = useState(null);
  const [logoLoadError, setLogoLoadError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    // 1. Instantly load cached clinic info from AsyncStorage
    getClinicInfo().then((cached) => {
      if (isMounted && cached) setClinic(cached);
    });

    // 2. Fetch fresh clinic info from public API
    getBranches()
      .then((res) => {
        if (isMounted && res.data?.clinic) {
          setClinic(res.data.clinic);
          setLogoLoadError(false);
          saveClinicInfo(res.data.clinic);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch clinic branding on login:', err?.message);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // ─── Validation ─────────────────────────────────────────────────────────────
  /**
   * Validates email and password, populates per-field errors.
   * Returns true only when both fields pass.
   */
  const validateForm = () => {
    let valid = true;

    // Email
    if (!email.trim() || !EMAIL_REGEX.test(email.trim())) {
      setEmailError('Please enter a valid email address.');
      valid = false;
    } else {
      setEmailError(null);
    }

    // Password
    if (!password || password.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      valid = false;
    } else {
      setPasswordError(null);
    }

    return valid;
  };

  // ─── Submit ─────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    setErrorMessage(null);
    if (!validateForm()) return;

    setLoading(true);
    try {
      const result = await login(email.trim().toLowerCase(), password);

      if (result.success) {
        // AuthContext state change automatically swaps to the authenticated stack
        return;
      } else if (result.needsVerification) {
        Alert.alert(
          'Email Verification Required',
          result.message || 'Your account is not verified yet. We have sent a verification code to your email.',
          [
            {
              text: 'Verify Now',
              onPress: () => navigation.navigate('VerifyEmail', { email: result.email || email.trim().toLowerCase() }),
            },
          ]
        );
        return;
      } else {
        const msg = result.error || 'Invalid email or password.';
        setErrorMessage(msg);
        Alert.alert('Login Failed', msg);
      }
    } catch (err) {
      const msg = err.message || 'An unexpected error occurred.';
      setErrorMessage(msg);
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  // ─── Forgot password actions ───────────────────────────────────────────────
  const handleForgotPassword = () => {
    setResetEmail(email.trim());
    setResetPhone('');
    setResetNewPassword('');
    setResetConfirmPassword('');
    setShowResetPassword(false);
    setShowResetConfirmPassword(false);
    setResetError(null);
    setForgotModalVisible(true);
  };

  const handleResetSubmit = async () => {
    setResetError(null);

    const trimmedEmail = resetEmail.trim().toLowerCase();
    const trimmedPhone = resetPhone.trim();

    if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
      setResetError('Please enter a valid email address.');
      return;
    }

    if (!trimmedPhone || !PHONE_REGEX.test(trimmedPhone)) {
      setResetError('Please enter an 11-digit mobile number starting with 09 (e.g. 09XXXXXXXXX).');
      return;
    }

    if (!resetNewPassword || resetNewPassword.length < 6) {
      setResetError('New password must be at least 6 characters.');
      return;
    }

    if (resetNewPassword !== resetConfirmPassword) {
      setResetError('Password confirmation does not match.');
      return;
    }

    setResetLoading(true);
    try {
      const response = await api.resetPassword({
        email: trimmedEmail,
        phone_number: trimmedPhone,
        password: resetNewPassword,
        password_confirmation: resetConfirmPassword,
      });

      setForgotModalVisible(false);
      setEmail(trimmedEmail);
      setPassword('');
      setErrorMessage(null);

      const successMsg =
        response.data?.message ||
        'Password has been reset successfully. You can now log in with your new password.';
      Alert.alert('Password Reset Successful', successMsg);
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        (err.response?.data?.errors
          ? Object.values(err.response.data.errors).flat().join('\n')
          : null) ||
        err.message ||
        'Failed to reset password. Please check your credentials and try again.';
      setResetError(msg);
    } finally {
      setResetLoading(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ── Top App Bar (72 px) ───────────────────────────────────────── */}
        <View style={styles.appBar}>
          {/* Back arrow */}
          <TouchableOpacity
            style={styles.appBarIconBtn}
            onPress={() => navigation.canGoBack() && navigation.goBack()}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>

          {/* Center: dynamic clinic logo + "VetBook" wordmark */}
          <View style={styles.appBarCenter}>
            {clinic?.logo_url && !logoLoadError ? (
              <Image
                source={{ uri: clinic.logo_url }}
                style={styles.logoImage}
                resizeMode="cover"
                onError={() => setLogoLoadError(true)}
              />
            ) : (
              <Image
                source={require('../../assets/icon.png')}
                style={styles.logoImage}
                resizeMode="cover"
              />
            )}
            <Text style={styles.appBarLogo}>VetBook</Text>
          </View>

          {/* Help icon */}
          <TouchableOpacity
            style={styles.appBarIconBtn}
            onPress={() => Alert.alert('Help', 'Contact support at vetbookbkpetaholic@gmail.com')}
            accessibilityLabel="Help"
          >
            <Ionicons name="help-circle-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* ── Scrollable content ────────────────────────────────────────── */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Trust pill badge ─────────────────────────────────────── */}
          <View style={styles.badgeWrapper}>
            <View style={styles.trustBadge}>
              <Ionicons name="paw-outline" size={12} color={colors.amber} />
              <Text style={styles.trustBadgeText}>TRUSTED PET CARE</Text>
            </View>
          </View>

          {/* ── Heading ──────────────────────────────────────────────── */}
          <Text style={styles.heading}>Welcome back</Text>

          {/* ── Subtitle ─────────────────────────────────────────────── */}
          <Text style={styles.subtitle}>
            Sign in to manage your pet's appointments and health records.
          </Text>

          {/* ── Form Card ────────────────────────────────────────────── */}
          <View style={styles.formCard}>

            {/* — Email Address field — */}
            <View style={styles.fieldWrapper}>
              <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
              <View style={[styles.inputRow, !!emailError && styles.inputRowError]}>
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={emailError ? colors.alertRed : colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="sarah.jenkins@example.com"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  returnKeyType="next"
                />
              </View>
              {!!emailError && <Text style={styles.errorText}>{emailError}</Text>}
            </View>

            {/* — Password field — */}
            <View style={styles.fieldWrapper}>
              <Text style={styles.fieldLabel}>PASSWORD</Text>
              <View style={[styles.inputRow, !!passwordError && styles.inputRowError]}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={passwordError ? colors.alertRed : colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                {/* Eye toggle */}
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
              {!!passwordError && <Text style={styles.errorText}>{passwordError}</Text>}
            </View>

            {/* — Forgot password? link (right-aligned) — */}
            <TouchableOpacity
              style={styles.forgotWrapper}
              onPress={handleForgotPassword}
              accessibilityRole="link"
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {/* — General error message (from backend) — */}
            {!!errorMessage && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={15} color={colors.alertRed} />
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
              </View>
            )}

            {/* — Login CTA button — */}
            <TouchableOpacity
              style={[styles.loginButton, loading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Login"
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Text style={styles.loginButtonText}>Login</Text>
                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color={colors.white}
                    style={styles.loginArrow}
                  />
                </>
              )}
            </TouchableOpacity>
          </View>
          {/* ── End of form card ─────────────────────────────────────── */}

          {/* ── Trust note ───────────────────────────────────────────── */}
          <View style={styles.trustNote}>
            <Ionicons
              name="shield-checkmark-outline"
              size={14}
              color={colors.primary}
            />
            <Text style={styles.trustNoteText}>
              Your information is securely encrypted and HIPAA-compliant
            </Text>
          </View>

          {/* ── Footer: Sign Up link ──────────────────────────────────── */}
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Register')}
              accessibilityRole="link"
            >
              <Text style={styles.footerLink}>Sign Up</Text>
            </TouchableOpacity>
          </View>

          {/* ── Terms & Agreement link ───────────────────────────────── */}
          <View style={styles.termsRow}>
            <Text style={styles.termsPrefixText}>By signing in, you agree to our </Text>
            <TouchableOpacity
              onPress={() => setTermsModalVisible(true)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel="View Terms and Agreement"
            >
              <Text style={styles.termsLink}>Terms & Agreement</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* ── Reset Password Modal ────────────────────────────────────── */}
        <Modal
          visible={forgotModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => !resetLoading && setForgotModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalOverlay}
          >
            <View style={styles.sheetContainer}>
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHeaderLeft}>
                  <View style={styles.sheetIconBadge}>
                    <Ionicons name="key-outline" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.sheetHeaderText}>
                    <Text style={styles.sheetTitle}>Reset Password</Text>
                    <Text style={styles.sheetSub}>
                      Enter your registered email and phone number to verify your account.
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setForgotModalVisible(false)}
                  style={styles.sheetCloseBtn}
                  disabled={resetLoading}
                  accessibilityLabel="Close dialog"
                >
                  <Ionicons name="close" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>

              {/* Error Banner */}
              {!!resetError && (
                <View style={styles.resetErrorBanner}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.alertRed} />
                  <Text style={styles.resetErrorText}>{resetError}</Text>
                </View>
              )}

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={styles.modalScroll}
              >
                {/* Email Address */}
                <View style={styles.modalFieldWrapper}>
                  <Text style={styles.fieldLabel}>REGISTERED EMAIL</Text>
                  <View style={styles.inputRow}>
                    <Ionicons
                      name="mail-outline"
                      size={18}
                      color={colors.textSecondary}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.textInput}
                      value={resetEmail}
                      onChangeText={setResetEmail}
                      placeholder="sarah.jenkins@example.com"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      returnKeyType="next"
                      editable={!resetLoading}
                    />
                  </View>
                </View>

                {/* Mobile Number */}
                <View style={styles.modalFieldWrapper}>
                  <Text style={styles.fieldLabel}>11-DIGIT MOBILE NUMBER</Text>
                  <View style={styles.inputRow}>
                    <Ionicons
                      name="call-outline"
                      size={18}
                      color={colors.textSecondary}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.textInput}
                      value={resetPhone}
                      onChangeText={setResetPhone}
                      placeholder="09XXXXXXXXX"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="phone-pad"
                      maxLength={11}
                      returnKeyType="next"
                      editable={!resetLoading}
                    />
                  </View>
                </View>

                {/* New Password */}
                <View style={styles.modalFieldWrapper}>
                  <Text style={styles.fieldLabel}>NEW PASSWORD</Text>
                  <View style={styles.inputRow}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color={colors.textSecondary}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.textInput}
                      value={resetNewPassword}
                      onChangeText={setResetNewPassword}
                      placeholder="At least 6 characters"
                      placeholderTextColor={colors.textMuted}
                      secureTextEntry={!showResetPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="next"
                      editable={!resetLoading}
                    />
                    <TouchableOpacity
                      onPress={() => setShowResetPassword((v) => !v)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel={showResetPassword ? 'Hide password' : 'Show password'}
                    >
                      <Ionicons
                        name={showResetPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color={colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Confirm New Password */}
                <View style={styles.modalFieldWrapper}>
                  <Text style={styles.fieldLabel}>CONFIRM NEW PASSWORD</Text>
                  <View style={styles.inputRow}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color={colors.textSecondary}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.textInput}
                      value={resetConfirmPassword}
                      onChangeText={setResetConfirmPassword}
                      placeholder="Confirm new password"
                      placeholderTextColor={colors.textMuted}
                      secureTextEntry={!showResetConfirmPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={handleResetSubmit}
                      editable={!resetLoading}
                    />
                    <TouchableOpacity
                      onPress={() => setShowResetConfirmPassword((v) => !v)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel={showResetConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      <Ionicons
                        name={showResetConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color={colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>

              {/* Modal Action Buttons */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setForgotModalVisible(false)}
                  disabled={resetLoading}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalSubmitBtn, resetLoading && styles.modalSubmitBtnDisabled]}
                  onPress={handleResetSubmit}
                  disabled={resetLoading}
                  activeOpacity={0.85}
                >
                  {resetLoading ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.modalSubmitText}>Reset Password</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </KeyboardAvoidingView>

      {/* ── Terms & Agreement Modal Prompt ─────────────────────────── */}
      <TermsModal
        visible={termsModalVisible}
        onClose={() => setTermsModalVisible(false)}
        title="Terms & Conditions"
        subtitle="Clinic policies & terms of service"
        showAcceptButton={true}
        acceptText="I Understand & Agree"
      />
    </SafeAreaView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Layout ──────────────────────────────────────────────────────────────────
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,   // #FAF6F0
  },
  flex: {
    flex: 1,
  },

  // ── Top App Bar (72 px) ───────────────────────────────────────────────────
  appBar: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  appBarIconBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appBarCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  logoImage: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
  },
  logoIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: colors.cardBeige,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoLeaf: {
    transform: [{ rotate: '-20deg' }],
    position: 'absolute',
    top: 5,
    left: 6,
  },
  logoPaw: {
    position: 'absolute',
    bottom: 4,
    right: 4,
  },
  appBarLogo: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.xl,              // 18 px
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },

  // ── ScrollView ──────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
  },

  // ── Trust pill badge ─────────────────────────────────────────────────────
  badgeWrapper: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.cardLightBeige,  // #F0E8DB
    paddingVertical: 6,
    paddingHorizontal: spacing.base,
    borderRadius: radii.pill,
  },
  trustBadgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.body,               // 12 px
    color: colors.amber,                    // #705C30
    letterSpacing: 1.0,
  },

  // ── Heading & Subtitle ───────────────────────────────────────────────────
  heading: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.hero,              // 30 px
    color: colors.textPrimary,            // #2E3230
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,               // 14 px
    color: colors.textTertiary,           // #4A4E4A
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
  },

  // ── Form Card ────────────────────────────────────────────────────────────
  formCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: radii.xl,               // 24 px
    padding: spacing.xl,                  // 24 px
    borderWidth: 1,
    borderColor: colors.border,
    // Card shadow
    shadowColor: colors.textPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
    marginBottom: spacing.lg,
  },

  // ── Field ────────────────────────────────────────────────────────────────
  fieldWrapper: {
    marginBottom: spacing.base,
  },
  fieldLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body,             // 12 px
    color: colors.textPrimary,
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    backgroundColor: colors.cardWarm,     // #F5F1EA
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  inputRowError: {
    borderColor: colors.alertRed,
    borderWidth: 1.5,
  },
  inputIcon: {
    width: 20,
    textAlign: 'center',
  },
  textInput: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,               // 14 px
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  errorText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,               // 10 px
    color: colors.alertRed,
    marginTop: spacing.xs,
    marginLeft: spacing.sm,
  },

  // ── Forgot password ───────────────────────────────────────────────────────
  forgotWrapper: {
    alignSelf: 'flex-end',
    marginBottom: spacing.lg,
    marginTop: -spacing.xs,
  },
  forgotText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,              // 11 px
    color: colors.primary,              // #4A7C59
  },

  // ── Error banner (backend errors) ────────────────────────────────────────
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.alertRedLight,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.base,
  },
  errorBannerText: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.alertRedDark,
  },

  // ── Login CTA button ──────────────────────────────────────────────────────
  loginButton: {
    height: 56,
    backgroundColor: colors.primary,     // #4A7C59
    borderRadius: radii.pill,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    shadowColor: colors.primaryDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 5,
  },
  loginButtonDisabled: {
    opacity: 0.65,
  },
  loginButtonText: {
    fontFamily: fonts.bodySemiBold,       // NunitoSans 700 — closest to "bold 16px"
    fontSize: fontSizes.lg,              // 16 px
    color: colors.white,
    letterSpacing: 0.3,
  },
  loginArrow: {
    marginTop: 1,
  },

  // ── Trust note ────────────────────────────────────────────────────────────
  trustNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'center',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  trustNoteText: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,             // 10 px
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  footerLink: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.primary,
  },

  // ── Reset Password Modal ──────────────────────────────────────────────────
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
    paddingBottom: Platform.OS === 'ios' ? spacing.xxl : spacing.xl,
    shadowColor: colors.textPrimary,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
    maxHeight: '90%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  sheetHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    paddingRight: spacing.sm,
  },
  sheetIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primaryPale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHeaderText: {
    flex: 1,
  },
  sheetTitle: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.xl,
    color: colors.textPrimary,
  },
  sheetSub: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.cardWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.alertRedLight,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.base,
  },
  resetErrorText: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.alertRedDark,
    lineHeight: 16,
  },
  modalScroll: {
    maxHeight: 360,
  },
  modalFieldWrapper: {
    marginBottom: spacing.base,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.xs,
  },
  modalCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  modalSubmitBtn: {
    flex: 2,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primaryDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  modalSubmitBtnDisabled: {
    opacity: 0.65,
  },
  modalSubmitText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.white,
    letterSpacing: 0.3,
  },
  termsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  termsPrefixText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  termsLink: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs,
    color: colors.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
    lineHeight: 18,
  },
});

export default LoginScreen;
