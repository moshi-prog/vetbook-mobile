/**
 * VerifyEmailScreen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook — 6-Digit Email Verification (OTP) Screen
 *
 * Requirements:
 *  • 6 individual digit input boxes with auto-focus to next box on keystroke
 *  • Backspace navigation retreats to previous box
 *  • Support pasting a full 6-digit OTP code into any box
 *  • "Verify & Activate Account" action button
 *  • "Resend Code" action with 60-second cooldown timer
 *  • "Wrong email? Back to Register" navigation
 *  • Transitions directly into authenticated stack on success
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

  const [digits, setDigits] = useState(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [timer, setTimer] = useState(RESEND_COOLDOWN_SECONDS);
  const [errorMessage, setErrorMessage] = useState(null);

  const inputRefs = useRef([]);

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

  // Focus the first input on mount
  useEffect(() => {
    const focusTimeout = setTimeout(() => {
      if (inputRefs.current[0]) {
        inputRefs.current[0].focus();
      }
    }, 300);
    return () => clearTimeout(focusTimeout);
  }, []);

  const handleDigitChange = (text, index) => {
    setErrorMessage(null);

    // Handle full code paste (e.g. from SMS/email paste suggestions)
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length >= CODE_LENGTH) {
      const newDigits = cleaned.slice(0, CODE_LENGTH).split('');
      setDigits(newDigits);
      if (inputRefs.current[CODE_LENGTH - 1]) {
        inputRefs.current[CODE_LENGTH - 1].focus();
      }
      return;
    }

    const singleDigit = cleaned.slice(-1);
    const newDigits = [...digits];
    newDigits[index] = singleDigit;
    setDigits(newDigits);

    // Advance to next box if digit was typed
    if (singleDigit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // Move back to previous box and clear it
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const handleVerify = async () => {
    const fullCode = digits.join('');
    if (fullCode.length !== CODE_LENGTH) {
      setErrorMessage('Please enter all 6 digits of your verification code.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const result = await verifyEmail(email, fullCode);

      if (result.success) {
        // Success: AuthContext automatically transitions into authenticated home stack
        return;
      } else {
        const msg = result.error || 'Invalid or expired verification code.';
        setErrorMessage(msg);
        Alert.alert('Verification Failed', msg);
      }
    } catch (err) {
      const msg = err.message || 'An unexpected error occurred.';
      setErrorMessage(msg);
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Bar with Back Arrow */}
          <View style={styles.topBar}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Hero Icon */}
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <Ionicons name="mail-unread" size={38} color={colors.primary} />
            </View>
          </View>

          {/* Header Title & Subtitle */}
          <Text style={styles.title}>Verify Your Email</Text>
          <Text style={styles.subtitle}>
            We've sent a 6-digit verification code to
          </Text>
          <View style={styles.emailPill}>
            <Ionicons name="mail" size={14} color={colors.primaryDeep} style={{ marginRight: 6 }} />
            <Text style={styles.emailText} numberOfLines={1}>
              {email || 'your email address'}
            </Text>
          </View>

          <Text style={styles.hint}>
            Please check your inbox or spam folder and enter the code below to activate your account.
          </Text>

          {/* 6 Digit Input Boxes */}
          <View style={styles.digitsRow}>
            {digits.map((digit, idx) => (
              <TextInput
                key={idx}
                ref={(ref) => (inputRefs.current[idx] = ref)}
                style={[
                  styles.digitBox,
                  digit ? styles.digitBoxFilled : null,
                  errorMessage ? styles.digitBoxError : null,
                ]}
                value={digit}
                onChangeText={(text) => handleDigitChange(text, idx)}
                onKeyPress={(e) => handleKeyPress(e, idx)}
                keyboardType="number-pad"
                maxLength={CODE_LENGTH}
                selectTextOnFocus
                textAlign="center"
                autoFocus={idx === 0}
              />
            ))}
          </View>

          {/* Error Message */}
          {errorMessage && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color={colors.alertRed} style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* Verify Action Button */}
          <TouchableOpacity
            style={[styles.verifyButton, loading && styles.buttonDisabled]}
            onPress={handleVerify}
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
                <Ionicons name="time-outline" size={14} color={colors.textSecondary} style={{ marginRight: 4 }} />
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
    paddingHorizontal: 24,
    paddingBottom: 36,
    alignItems: 'center',
  },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
  },
  iconContainer: {
    marginTop: 20,
    marginBottom: 18,
    alignItems: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(74, 124, 89, 0.25)',
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 26,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emailPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors.divider,
    marginTop: 8,
    marginBottom: 12,
    maxWidth: '90%',
  },
  emailText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryDeep,
  },
  hint: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  digitsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
    gap: 8,
  },
  digitBox: {
    flex: 1,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.divider,
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: fonts.headingBold,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  digitBoxFilled: {
    borderColor: colors.primary,
    backgroundColor: '#FAFAF8',
  },
  digitBoxError: {
    borderColor: colors.alertRed,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  errorText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.alertRed,
    fontWeight: '600',
  },
  verifyButton: {
    width: '100%',
    height: 52,
    backgroundColor: colors.primary,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 24,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
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
    marginBottom: 28,
  },
  resendPrompt: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardWarm,
    paddingHorizontal: 12,
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
    fontSize: 14,
    color: colors.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  footerLink: {
    paddingVertical: 8,
  },
  footerLinkText: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  footerLinkBold: {
    fontWeight: '700',
    color: colors.primary,
  },
});

export default VerifyEmailScreen;

