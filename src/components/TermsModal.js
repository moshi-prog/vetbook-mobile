import React from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, fontSizes, spacing, radii } from '../theme';

/**
 * TermsModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal prompt displaying VetBook's Terms of Service, Clinic Policies,
 * and Privacy Guidelines. Used on LoginScreen, RegisterScreen, and ProfileScreen.
 */
const TermsModal = ({
  visible,
  onClose,
  onAccept,
  title = 'Terms & Conditions',
  subtitle = 'Clinic policies & terms of service',
  showAcceptButton = false,
  acceptText = 'I Understand & Agree',
}) => {
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheetContainer}>
              {/* Header */}
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHeaderLeft}>
                  <View style={styles.headerIconBadge}>
                    <Ionicons name="document-text" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetTitle}>{title}</Text>
                    <Text style={styles.sheetSub}>{subtitle}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Close terms dialog"
                >
                  <Ionicons name="close" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>

              {/* Scrollable Content */}
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.contentSection}>
                  <Text style={styles.contentSectionTitle}>1. Appointments & Punctuality</Text>
                  <Text style={styles.contentBody}>
                    Please arrive 10 to 15 minutes before your confirmed appointment slot. Because clinic capacity is managed to prevent overcrowding and pet stress, slots are held for up to 15 minutes before being released to walk-in patients.
                  </Text>
                </View>

                <View style={styles.contentSection}>
                  <Text style={styles.contentSectionTitle}>2. Safety & Restraint</Text>
                  <Text style={styles.contentBody}>
                    For the safety of all patients and clients, all dogs must be securely leashed at all times within clinic premises, and cats must be transported in well-ventilated pet carriers. If your pet is reactive or aggressive, kindly notify the front desk upon arrival.
                  </Text>
                </View>

                <View style={styles.contentSection}>
                  <Text style={styles.contentSectionTitle}>3. Emergency Triage</Text>
                  <Text style={styles.contentBody}>
                    Our veterinary staff reserves the right to prioritize critical, life-threatening emergency cases over non-urgent scheduled appointments. We appreciate your understanding and patience during unexpected emergency procedures.
                  </Text>
                </View>

                <View style={styles.contentSection}>
                  <Text style={styles.contentSectionTitle}>4. Payment & Consultation Fees</Text>
                  <Text style={styles.contentBody}>
                    Consultation, treatment, medications, and laboratory fees are settled at the clinic reception following the visit. Payment can be made in cash, GCash, or Maya. Itemized receipts and medical summaries are provided upon discharge.
                  </Text>
                </View>

                <View style={styles.contentSection}>
                  <Text style={styles.contentSectionTitle}>5. Privacy & Data Protection</Text>
                  <Text style={styles.contentBody}>
                    Your personal information and your pet’s health records are securely stored and encrypted. We will never share or sell your contact information to third parties without your explicit consent.
                  </Text>
                </View>

                <View style={styles.contentSection}>
                  <Text style={styles.contentSectionTitle}>6. Account Responsibility</Text>
                  <Text style={styles.contentBody}>
                    You are responsible for maintaining the accuracy of your pet profile details, vaccination history, and account credentials. Providing accurate medical history helps our veterinarians provide the best medical care possible.
                  </Text>
                </View>
              </ScrollView>

              {/* Action Buttons */}
              <View style={styles.actionContainer}>
                {showAcceptButton && (
                  <TouchableOpacity
                    style={styles.acceptBtn}
                    onPress={() => {
                      if (onAccept) onAccept();
                      onClose();
                    }}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="checkmark-circle-outline" size={18} color={colors.white} />
                    <Text style={styles.acceptBtnText}>{acceptText}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.dismissBtn, !showAcceptButton && styles.dismissBtnFull]}
                  onPress={onClose}
                  activeOpacity={0.85}
                >
                  <Text style={styles.dismissBtnText}>
                    {showAcceptButton ? 'Cancel' : 'Close'}
                  </Text>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(46,50,48,0.5)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
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
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.lg,
    color: colors.textPrimary,
  },
  sheetSub: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
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
  modalScroll: {
    marginVertical: spacing.md,
  },
  scrollContent: {
    paddingBottom: spacing.sm,
  },
  contentSection: {
    marginBottom: spacing.md,
  },
  contentSectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.primaryDeep,
    marginBottom: 4,
  },
  contentBody: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  actionContainer: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    height: 48,
    borderRadius: radii.pill,
    shadowColor: colors.primaryDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  acceptBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.white,
  },
  dismissBtn: {
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardWarm,
  },
  dismissBtnFull: {
    backgroundColor: colors.primary,
  },
  dismissBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
  },
});

export default TermsModal;
