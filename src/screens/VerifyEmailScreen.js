/**
 * VerifyEmailScreen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook — 6-Digit Email Verification (OTP) Screen
 *
 * Requirements:
 *  • Tapping anywhere on the 6 digit cards immediately activates the keyboard.
 *  • Direct native touch on the single TextInput with pointerEvents="none" on visual cells.
 *  • Auto-submit and keyboard dismissal upon entering the 6th digit.
 *  • Works seamlessly across iOS, Android, and Web.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts } from '../theme';
import { useAuth } from '../contexts/AuthContext';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

const VerifyEmailScreen = ({ route, navigation }) => {
  const email = route.params?.email || '';
  const { verifyEmail, resendVerificationCode } = useAuth();

  const [code, setCode] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [timer, setTimer] = useState(RESEND_COOLDOWN_SECONDS);
  const [errorMessage, setErrorMessage] = useState(null);

  const inputRef = useRef(null);

  // Countdown timer for resend cooldown
  useEffect(() => {
    let interval = null;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timer]);

  // Focus input on mount with slight delay for smooth navigation transition
  useEffect(() => {
    const focusTimeout = setTimeout(() => {
      inputRef.current?.focus();
    }, 350);
    return () => clearTimeout(focusTimeout);
  }, []);

  const executeVerify = async (fullCode) => {
    if (fullCode.length !== CODE_LENGTH) {
      setErrorMessage('Please enter all 6 digits of your verification code.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    Keyboard.dismiss();

    try {
      const result = await verifyEmail(email, fullCode);

      if (result.success) {
        // Success: AuthContext transitions directly into authenticated home stack
        return;
      } else {
        const msg = result.error || 'Invalid or expired verification code.';
        setErrorMessage(msg);
      }
    } catch (err) {
      const msg = err.message || 'An unexpected error occurred.';
      setErrorMessage(msg);
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (text) => {
    const cleaned = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(cleaned);
    setErrorMessage(null);

    // Auto-verify as soon as 6 digits are typed or pasted
    if (cleaned.length === CODE_LENGTH) {
      executeVerify(cleaned);
    }
  };

  const handleResend = async () => {
    if (timer > 0 || resending) return;

    setResending(true);
    setErrorMessage(null);

    try {
      const result = await resendVerificationCode(email);

      if (result.success) {
        setTimer(RESEND_COOLDOWN_SECONDS);
        Alert.alert('Code Resent', 'A new 6-digit verification code has been sent to your email.');
      } else {
        const msg = result.error || 'Could not resend code. Please try again.';
        if (result.retryAfter) {
          setTimer(result.retryAfter);
        }
        Alert.alert('Notice', msg);
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to resend code.');
    } finally {
      setResending(false);
    }
  };

  const handleContainerPress = () => {
    inputRef.current?.focus();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Top Bar with Back Arrow */}
          <View style={styles.topBar}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButton}
              activeOpacity={0.7}
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Compact Hero Icon */}
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <Ionicons name="mail-unread" size={28} color={colors.primary} />
            </View>
          </View>

          {/* Header Title & Subtitle */}
          <Text style={styles.title}>Verify Your Email</Text>
          <Text style={styles.subtitle}>
            We've sent a 6-digit verification code to
          </Text>
          <View style={styles.emailPill}>
            <Ionicons name="mail" size={13} color={colors.primaryDeep} style={{ marginRight: 6 }} />
            <Text style={styles.emailText} numberOfLines={1}>
              {email || 'your email address'}
            </Text>
          </View>

          <Text style={styles.hint}>
            Please check your inbox or spam folder and enter the code below to activate your account.
          </Text>

          {/* ── Visual 6-Digit OTP Cells Container ── */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleContainerPress}
            style={styles.otpWrapper}
          >
            {/* Visual boxes rendered underneath (pointerEvents="none" passes touches directly to the input) */}
            <View style={styles.cellsRow} pointerEvents="none">
              {Array.from({ length: CODE_LENGTH }).map((_, idx) => {
                const digit = code[idx] || '';
                const isCurrent = code.length === idx;
                const isFilled = !!digit;

                return (
                  <View
                    key={idx}
                    style={[
                      styles.cellBox,
                      isFilled && styles.cellBoxFilled,
                      isCurrent && isFocused && styles.cellBoxActive,
                      errorMessage && styles.cellBoxError,
                    ]}
                  >
                    <Text style={styles.cellDigit}>{digit}</Text>
                    {isCurrent && isFocused && <View style={styles.blinkingCursor} />}
                  </View>
                );
              })}
            </View>

            {/* Native TextInput sitting directly on top for 100% reliable tap response */}
            <TextInput
              ref={inputRef}
              value={code}
              onChangeText={handleCodeChange}
              maxLength={CODE_LENGTH}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              autoFocus={true}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              style={styles.hiddenInput}
              caretHidden={true}
            />
          </TouchableOpacity>

          {/* Fallback Tap Helper */}
          <TouchableOpacity
            onPress={handleContainerPress}
            activeOpacity={0.7}
            style={styles.tapPromptRow}
          >
            <Ionicons name="keypad-outline" size={14} color={isFocused ? colors.primary : colors.textSecondary} style={{ marginRight: 4 }} />
            <Text style={[styles.tapPromptText, isFocused && { color: colors.primary }]}>
              {isFocused ? 'Keypad active — type or paste code' : 'Tap here to enter code'}
            </Text>
          </TouchableOpacity>

          {/* Error Message */}
          {errorMessage && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={15} color={colors.alertRed} style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* Verify & Activate Account Action Button */}
          <TouchableOpacity
            style={[styles.verifyButton, loading && styles.buttonDisabled]}
            onPress={() => executeVerify(code)}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Text style={styles.verifyButtonText}>Verify &amp; Activate Account</Text>
            )}
          </TouchableOpacity>

          {/* Resend Code Section */}
          <View style={styles.resendSection}>
            <Text style={styles.resendPrompt}>Didn't receive the code?</Text>
            {timer > 0 ? (
              <View style={styles.timerBadge}>
                <Ionicons name="time-outline" size={13} color={colors.textSecondary} style={{ marginRight: 4 }} />
                <Text style={styles.timerText}>Resend code in {timer}s</Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleResend}
                disabled={resending}
                activeOpacity={0.7}
              >
                {resending ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.resendActionText}>Resend Code</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Footer Navigation */}
          <TouchableOpacity
            style={styles.footerLink}
            onPress={() => navigation.navigate('Register')}
            activeOpacity={0.7}
          >
            <Text style={styles.footerLinkText}>
              Wrong email address? <Text style={styles.footerLinkBold}>Back to Register</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
    alignItems: 'center',
  },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
  },
  iconContainer: {
    marginTop: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(74, 124, 89, 0.25)',
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emailPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors.divider,
    marginTop: 6,
    marginBottom: 8,
    maxWidth: '92%',
  },
  emailText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDeep,
  },
  hint: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 14,
    paddingHorizontal: 10,
  },

  // ── OTP Cells & Hidden Input ──
  otpWrapper: {
    position: 'relative',
    width: '100%',
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 6,
  },
  cellsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    height: 56,
  },
  cellBox: {
    width: 46,
    height: 54,
    borderRadius: 13,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  cellBoxActive: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: '#FAFDF9',
  },
  cellBoxFilled: {
    borderColor: colors.primary,
    backgroundColor: '#FAFAF8',
  },
  cellBoxError: {
    borderColor: colors.alertRed,
  },
  cellDigit: {
    fontFamily: fonts.headingBold,
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  blinkingCursor: {
    position: 'absolute',
    width: 2,
    height: 20,
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    opacity: 0.01,
    color: 'transparent',
  },
  tapPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 12,
    paddingVertical: 4,
  },
  tapPromptText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },

  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  errorText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.alertRed,
    fontWeight: '600',
  },
  verifyButton: {
    width: '100%',
    height: 50,
    backgroundColor: colors.primary,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 18,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  verifyButtonText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
  resendSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  resendPrompt: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardWarm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  timerText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  resendActionText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  footerLink: {
    paddingVertical: 6,
  },
  footerLinkText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  footerLinkBold: {
    fontWeight: '700',
    color: colors.primary,
  },
});

export default VerifyEmailScreen;
