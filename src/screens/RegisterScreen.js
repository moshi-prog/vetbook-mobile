/**
 * RegisterScreen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook — Create Account Screen
 *
 * Figma spec:
 *  • Background: #FAF6F0
 *  • Top app bar (64 px): back arrow | centered VetBook logo | badge
 *  • Heading: "Create your account"  — Literata 30 px bold, #2E3230
 *  • Subtitle: Nunito Sans 14 px, #6B6358
 *  • 5 form fields (full name, email, phone, password, confirm password)
 *    – Input bg #F5F1EA, border rgba(196,200,188,0.4), radius 24 px, h 46 px
 *    – Labels: uppercase, Nunito Sans 700 12 px, letter-spaced, #2E3230
 *    – Error state: red border + error text below
 *    – Password fields: eye/eye-off toggle
 *    – Confirm field: green checkmark when matching
 *  • Terms checkbox: green 18×18 rounded 8 px
 *  • CTA: "Create Account" + arrow, bg #4A7C59, radius 24 px, h 52 px
 *  • Footer: "Already have an account? Sign In" — "Sign In" in green
 *
 * Auth: calls useAuth().register() on valid submit.
 * Navigation: back arrow → goBack(), footer → navigate('Login')
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, fontSizes, spacing, radii } from '../theme';
import { useAuth } from '../contexts/AuthContext';

// ─── Validation helpers ───────────────────────────────────────────────────────

/** Basic RFC-5322-inspired e-mail regex */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Backend expects exactly 11 digits (digits:11 rule) — standard PH format.
 * Strips any accidental non-digit characters before checking length.
 */
const isValidPhone = (raw) => raw.replace(/\D/g, '').length === 11;

// ─────────────────────────────────────────────────────────────────────────────

const RegisterScreen = ({ navigation }) => {
  const { register } = useAuth();

  // ── Form field values ──────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // ── UI state ───────────────────────────────────────────────────────────────
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Per-field error messages (null = no error) ─────────────────────────────
  const [nameError, setNameError] = useState(null);
  const [emailError, setEmailError] = useState(null);
  const [phoneError, setPhoneError] = useState(null);
  const [passwordError, setPasswordError] = useState(null);
  const [confirmError, setConfirmError] = useState(null);

  // ── Derived: passwords match (only meaningful when both fields have input) ─
  const passwordsMatch =
    confirmPassword.length > 0 && password === confirmPassword;

  // ─── Validation ─────────────────────────────────────────────────────────────
  /**
   * Runs all field validations, sets per-field errors, and returns true
   * if the entire form is valid.
   */
  const validateForm = () => {
    let valid = true;

    // Full Name
    if (!name.trim() || name.trim().length < 2) {
      setNameError('Full name must be at least 2 characters.');
      valid = false;
    } else {
      setNameError(null);
    }

    // Email
    if (!email.trim() || !EMAIL_REGEX.test(email.trim())) {
      setEmailError('Please enter a valid email address.');
      valid = false;
    } else {
      setEmailError(null);
    }

    // Phone — must be exactly 11 digits to satisfy backend `digits:11` rule
    if (!phone.trim() || !isValidPhone(phone)) {
      setPhoneError('Must be exactly 11 digits (e.g. 09171234567).');
      valid = false;
    } else {
      setPhoneError(null);
    }

    // Password
    if (!password || password.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      valid = false;
    } else {
      setPasswordError(null);
    }

    // Confirm Password
    if (!confirmPassword || confirmPassword !== password) {
      setConfirmError('Passwords do not match.');
      valid = false;
    } else {
      setConfirmError(null);
    }

    // Terms
    if (!agreedToTerms) {
      Alert.alert(
        'Terms Required',
        'Please agree to the Terms of Service and Privacy Policy to continue.',
      );
      valid = false;
    }

    return valid;
  };

  // ─── Submit handler ──────────────────────────────────────────────────────────
  const handleRegister = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const result = await register({
        name:                  name.trim(),
        email:                 email.trim().toLowerCase(),
        phone_number:          phone.replace(/\D/g, ''), // strip non-digits; backend expects `digits:11`
        password,
        password_confirmation: confirmPassword,          // required by Laravel `confirmed` rule
      });

      if (result.success) {
        navigation.navigate('VerifyEmail', { email: email.trim().toLowerCase() });
      } else {
        Alert.alert('Registration Failed', result.error || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Render helpers ──────────────────────────────────────────────────────────

  /**
   * Renders a labelled input row with a leading icon.
   *
   * @param {object} props
   * @param {string}   props.label          — uppercase label text
   * @param {string}   props.iconName       — Ionicons icon name
   * @param {string}   props.value          — controlled value
   * @param {Function} props.onChangeText   — setter
   * @param {string}   [props.placeholder]
   * @param {string}   [props.keyboardType]
   * @param {boolean}  [props.secureTextEntry]
   * @param {Function} [props.onToggleSecure] — if present, renders eye toggle
   * @param {boolean}  [props.secureVisible] — current show/hide state
   * @param {boolean}  [props.showCheckmark] — renders green checkmark on right
   * @param {string}   [props.helperText]   — small grey text below input
   * @param {string}   [props.error]        — error text (also turns border red)
   * @param {string}   [props.autoCapitalize]
   * @param {boolean}  [props.autoCorrect]
   */
  const renderField = ({
    label,
    iconName,
    value,
    onChangeText,
    placeholder = '',
    keyboardType = 'default',
    secureTextEntry = false,
    onToggleSecure = null,
    secureVisible = false,
    showCheckmark = false,
    helperText = null,
    error = null,
    autoCapitalize = 'none',
    autoCorrect = false,
    maxLength = undefined,
  }) => {
    const hasError = !!error;

    return (
      <View style={styles.fieldWrapper}>
        {/* Label */}
        <Text style={styles.fieldLabel}>{label}</Text>

        {/* Input row */}
        <View style={[styles.inputRow, hasError && styles.inputRowError]}>
          {/* Leading icon */}
          <Ionicons
            name={iconName}
            size={18}
            color={hasError ? colors.alertRed : colors.textSecondary}
            style={styles.inputIcon}
          />

          {/* Text field */}
          <TextInput
            style={styles.textInput}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            keyboardType={keyboardType}
            secureTextEntry={secureTextEntry && !secureVisible}
            autoCapitalize={autoCapitalize}
            autoCorrect={autoCorrect}
            autoComplete="off"
            maxLength={maxLength}
          />

          {/* Right-side adornments: eye toggle OR checkmark */}
          {onToggleSecure && (
            <TouchableOpacity
              onPress={onToggleSecure}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={secureVisible ? 'Hide password' : 'Show password'}
            >
              <Ionicons
                name={secureVisible ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          )}

          {showCheckmark && passwordsMatch && (
            <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
          )}
        </View>

        {/* Helper text (shown when no error) */}
        {helperText && !hasError && (
          <Text style={styles.helperText}>{helperText}</Text>
        )}

        {/* Error text */}
        {hasError && <Text style={styles.errorText}>{error}</Text>}
      </View>
    );
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ── Top App Bar ───────────────────────────────────────────────── */}
        <View style={styles.appBar}>
          {/* Back arrow */}
          <TouchableOpacity
            style={styles.appBarButton}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>

          {/* Centered brand logo */}
          <View style={styles.appBarCenter}>
            <Text style={styles.appBarLogo}>VetBook</Text>
          </View>

          {/* Badge — mirrors the green status dot from SplashScreen */}
          <View style={styles.appBarBadge}>
            <View style={styles.badgeDot} />
          </View>
        </View>

        {/* ── Scrollable form body ──────────────────────────────────────── */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Heading */}
          <Text style={styles.heading}>Create your account</Text>

          {/* Subtitle */}
          <Text style={styles.subtitle}>
            Join VetBook to manage appointments and medical records for your pets.
          </Text>

          {/* ── Form fields ─────────────────────────────────────────────── */}

          {/* 1. Full Name */}
          {renderField({
            label: 'FULL NAME',
            iconName: 'person-outline',
            value: name,
            onChangeText: setName,
            placeholder: 'e.g. Jane Smith',
            autoCapitalize: 'words',
            autoCorrect: false,
            error: nameError,
          })}

          {/* 2. Email Address */}
          {renderField({
            label: 'EMAIL ADDRESS',
            iconName: 'mail-outline',
            value: email,
            onChangeText: setEmail,
            placeholder: 'you@example.com',
            keyboardType: 'email-address',
            error: emailError,
          })}

          {/* 3. Phone Number — backend expects exactly 11 digits (digits:11) */}
          {renderField({
            label: 'PHONE NUMBER',
            iconName: 'call-outline',
            value: phone,
            onChangeText: (text) => setPhone(text.replace(/\D/g, '')), // digits only
            placeholder: '11 digits (e.g. 09171234567)',
            keyboardType: 'number-pad',
            maxLength: 11,
            helperText: 'Format: 09171234567',
            error: phoneError,
          })}


          {/* 4. Password */}
          {renderField({
            label: 'PASSWORD',
            iconName: 'lock-closed-outline',
            value: password,
            onChangeText: setPassword,
            placeholder: 'Min. 6 characters',
            secureTextEntry: true,
            secureVisible: showPassword,
            onToggleSecure: () => setShowPassword((v) => !v),
            error: passwordError,
          })}

          {/* 5. Confirm Password */}
          {renderField({
            label: 'CONFIRM PASSWORD',
            iconName: 'lock-closed-outline',
            value: confirmPassword,
            onChangeText: setConfirmPassword,
            placeholder: 'Re-enter password',
            secureTextEntry: true,
            secureVisible: showConfirmPassword,
            onToggleSecure: () => setShowConfirmPassword((v) => !v),
            showCheckmark: true,
            error: confirmError,
          })}

          {/* ── Passwords-match indicator ──────────────────────────────── */}
          {passwordsMatch && (
            <View style={styles.matchRow}>
              <View style={styles.matchDot} />
              <Text style={styles.matchText}>Passwords match</Text>
            </View>
          )}

          {/* ── Terms & Conditions checkbox ────────────────────────────── */}
          <TouchableOpacity
            style={styles.termsRow}
            onPress={() => setAgreedToTerms((v) => !v)}
            activeOpacity={0.7}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreedToTerms }}
          >
            {/* Custom checkbox */}
            <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
              {agreedToTerms && (
                <Ionicons name="checkmark" size={12} color={colors.white} />
              )}
            </View>

            {/* Terms text */}
            <Text style={styles.termsText}>
              I agree to the{' '}
              <Text style={styles.termsLink}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>
            </Text>
          </TouchableOpacity>

          {/* ── CTA Button ────────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.ctaButton, loading && styles.ctaButtonDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Create Account"
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <Text style={styles.ctaText}>Create Account</Text>
                <Ionicons
                  name="arrow-forward"
                  size={18}
                  color={colors.white}
                  style={styles.ctaArrow}
                />
              </>
            )}
          </TouchableOpacity>

          {/* ── Footer: already have an account? ─────────────────────── */}
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              accessibilityRole="link"
            >
              <Text style={styles.footerLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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

  // ── Top App Bar (64 px tall) ─────────────────────────────────────────────
  appBar: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  appBarButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appBarCenter: {
    flex: 1,
    alignItems: 'center',
  },
  appBarLogo: {
    fontFamily: fonts.headingBold,         // Literata_700Bold
    fontSize: fontSizes.xl,               // 18 px
    color: colors.textPrimary,            // #2E3230
    letterSpacing: 0.3,
  },
  appBarBadge: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 9999,
    backgroundColor: colors.primary,
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

  // ── Heading & Subtitle ───────────────────────────────────────────────────
  heading: {
    fontFamily: fonts.headingBold,         // Literata_700Bold
    fontSize: fontSizes.hero,             // 30 px
    color: colors.textPrimary,            // #2E3230
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,               // 14 px
    color: colors.textSecondary,          // #6B6358
    lineHeight: 22,
    marginBottom: spacing.xl,
  },

  // ── Form Field ──────────────────────────────────────────────────────────────
  fieldWrapper: {
    marginBottom: spacing.base,
  },
  fieldLabel: {
    fontFamily: fonts.bodyBold,            // NunitoSans_700Bold
    fontSize: fontSizes.body,             // 12 px
    color: colors.textPrimary,            // #2E3230
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    backgroundColor: colors.cardWarm,     // #F5F1EA
    borderWidth: 1,
    borderColor: colors.border,           // rgba(196,200,188,0.3)
    borderRadius: radii.pill,             // 24 px (pill)
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  inputRowError: {
    borderColor: colors.alertRed,         // red border on validation error
    borderWidth: 1.5,
  },
  inputIcon: {
    // Width kept fixed so icon never shifts text
    width: 20,
    textAlign: 'center',
  },
  textInput: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,               // 14 px
    color: colors.textPrimary,
    paddingVertical: 0,                   // removes default Android padding
  },

  // ── Helper & Error text ──────────────────────────────────────────────────
  helperText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,               // 10 px
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginLeft: spacing.sm,
  },
  errorText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,               // 10 px
    color: colors.alertRed,
    marginTop: spacing.xs,
    marginLeft: spacing.sm,
  },

  // ── Passwords-match indicator ────────────────────────────────────────────
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
    marginLeft: spacing.sm,
  },
  matchDot: {
    width: 6,
    height: 6,
    borderRadius: 9999,
    backgroundColor: colors.primary,
  },
  matchText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.primary,
  },

  // ── Terms checkbox ───────────────────────────────────────────────────────
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: radii.sm,               // 8 px
    borderWidth: 1.5,
    borderColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,                         // optical alignment with first line of text
    backgroundColor: 'transparent',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,     // #4A7C59
    borderColor: colors.primary,
  },
  termsText: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,              // 11 px
    color: colors.textSecondary,
    lineHeight: 18,
  },
  termsLink: {
    fontFamily: fonts.bodySemiBold,
    color: colors.primary,
  },

  // ── CTA Button ───────────────────────────────────────────────────────────
  ctaButton: {
    height: 52,
    backgroundColor: colors.primary,     // #4A7C59
    borderRadius: radii.pill,            // pill shape
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
    // Subtle shadow for depth
    shadowColor: colors.primaryDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
  },
  ctaButtonDisabled: {
    opacity: 0.65,
  },
  ctaText: {
    fontFamily: fonts.headingBold,        // Literata_700Bold
    fontSize: fontSizes.lg,              // 16 px
    color: colors.white,
    letterSpacing: 0.3,
  },
  ctaArrow: {
    marginTop: 1,                         // optical baseline alignment
  },

  // ── Footer ───────────────────────────────────────────────────────────────
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
});

export default RegisterScreen;
