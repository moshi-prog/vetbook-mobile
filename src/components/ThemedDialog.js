import React from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, fontSizes, spacing, radii, shadows } from '../theme';

/**
 * ThemedDialog
 * ─────────────────────────────────────────────────────────────────────────────
 * Custom branded dialog replacing plain browser/system alerts.
 * Matches Figma styling: warm cream/white background, primary green, rounded 24px.
 */
const ThemedDialog = ({
  visible,
  title,
  message,
  type = 'info', // 'success' | 'error' | 'confirm' | 'info'
  confirmText = 'OK',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  destructive = false,
  loading = false,
}) => {
  if (!visible) return null;

  const isConfirm = Boolean(onCancel);

  // Icon configuration based on type
  let iconName = 'information-circle';
  let iconColor = colors.primary;
  let iconBg = colors.primaryPale;

  if (type === 'success') {
    iconName = 'checkmark-circle';
    iconColor = colors.primaryDeep;
    iconBg = colors.primaryPale;
  } else if (type === 'error' || destructive) {
    iconName = 'alert-circle';
    iconColor = colors.alertRed;
    iconBg = colors.alertRedLight;
  } else if (type === 'confirm') {
    iconName = 'help-circle';
    iconColor = colors.primary;
    iconBg = colors.primaryPale;
  }

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onCancel || onConfirm}
    >
      <TouchableWithoutFeedback onPress={onCancel || onConfirm}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.dialogCard}>
              {/* Icon badge */}
              <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
                <Ionicons name={iconName} size={28} color={iconColor} />
              </View>

              {/* Title & Message */}
              {!!title && <Text style={styles.title}>{title}</Text>}
              {!!message && (
                <ScrollView
                  style={{ maxHeight: 320, width: '100%', marginBottom: spacing.xl }}
                  showsVerticalScrollIndicator={false}
                >
                  <Text
                    style={[
                      styles.message,
                      typeof message === 'string' && message.includes('\n') && styles.messageMultiline,
                    ]}
                  >
                    {message}
                  </Text>
                </ScrollView>
              )}

              {/* Buttons */}
              <View style={[styles.btnRow, !isConfirm && styles.btnRowSingle]}>
                {isConfirm && (
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={onCancel}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.cancelBtnText}>{cancelText}</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.confirmBtn,
                    destructive && styles.confirmBtnDestructive,
                    !isConfirm && styles.confirmBtnFull,
                  ]}
                  onPress={onConfirm}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.confirmBtnText}>{confirmText}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(46, 50, 48, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.divider || '#EAE6DE',
    ...shadows.card,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.base,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.xl,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    color: '#3E433E',
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: spacing.xs,
  },
  messageMultiline: {
    textAlign: 'left',
    width: '100%',
    lineHeight: 22,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  btnRowSingle: {
    justifyContent: 'center',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.cardWarm,
    borderWidth: 1,
    borderColor: colors.divider || '#EAE6DE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  confirmBtnDestructive: {
    backgroundColor: colors.alertRed,
  },
  confirmBtnFull: {
    flex: 1,
    maxWidth: '100%',
  },
  confirmBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: colors.white,
  },
});

export default ThemedDialog;
