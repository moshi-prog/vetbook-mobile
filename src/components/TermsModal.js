import React from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, fontSizes, spacing, radii } from '../theme';

/**
 * TermsModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Aesthetic bottom sheet modal prompt displaying VetBook's Terms of Service,
 * Clinic Policies, and Privacy Guidelines.
 * Used on LoginScreen, RegisterScreen, and throughout the app.
 */
const TermsModal = ({
  visible,
  onClose,
  onAccept,
  title = 'Terms & Conditions',
  subtitle = 'Clinic policies & terms of service',
  showAcceptButton = true,
  acceptText = 'I Understand & Agree',
}) => {
  if (!visible) return null;

  const handleAccept = () => {
    if (onAccept) onAccept();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        {/* Backdrop touch area to dismiss */}
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel="Close terms backdrop"
        />

        {/* Modal Sheet Container */}
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderLeft}>
              <View style={styles.headerIconBadge}>
                <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>{title}</Text>
                <Text style={styles.sheetSub}>{subtitle}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close terms dialog"
            >
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Scrollable Content */}
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            {/* Section 1 */}
            <View style={styles.contentSection}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="time-outline" size={16} color={colors.primaryDeep} style={{ marginRight: 6 }} />
                <Text style={styles.contentSectionTitle}>1. Appointments & Punctuality</Text>
              </View>
              <Text style={styles.contentBody}>
                Please arrive 10 to 15 minutes before your confirmed appointment slot. Because clinic capacity is managed to prevent overcrowding and pet stress, reserved slots are held for up to 15 minutes before being released to walk-in patients. If you need to reschedule or cancel, please notify the clinic at least 2 hours in advance via the app.
              </Text>
            </View>

            {/* Section 2 */}
            <View style={styles.contentSection}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="paw-outline" size={16} color={colors.primaryDeep} style={{ marginRight: 6 }} />
                <Text style={styles.contentSectionTitle}>2. Safety & Pet Restraint</Text>
              </View>
              <Text style={styles.contentBody}>
                For the safety of all patients, owners, and veterinary staff, all dogs must be securely leashed at all times within clinic premises, and cats must be transported in secure, well-ventilated pet carriers. If your pet is nervous, reactive, or aggressive, kindly notify our front desk upon arrival so we can arrange suitable accommodations.
              </Text>
            </View>

            {/* Section 3 */}
            <View style={styles.contentSection}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="medkit-outline" size={16} color={colors.primaryDeep} style={{ marginRight: 6 }} />
                <Text style={styles.contentSectionTitle}>3. Emergency Triage Policies</Text>
              </View>
              <Text style={styles.contentBody}>
                Our veterinary team reserves the right to prioritize critical, life-threatening emergency cases over scheduled non-urgent appointments. We sincerely appreciate your patience and understanding should an urgent medical procedure cause a brief delay in your appointment.
              </Text>
            </View>

            {/* Section 4 */}
            <View style={styles.contentSection}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="card-outline" size={16} color={colors.primaryDeep} style={{ marginRight: 6 }} />
                <Text style={styles.contentSectionTitle}>4. Payment, Consultation & Treatment Fees</Text>
              </View>
              <Text style={styles.contentBody}>
                Consultation, medical treatments, medications, vaccinations, and diagnostic laboratory fees are settled at the clinic reception following the visit. Payment can be made in Cash, GCash, or Maya. Itemized medical receipts and treatment summaries are provided upon discharge.
              </Text>
            </View>

            {/* Section 5 */}
            <View style={styles.contentSection}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.primaryDeep} style={{ marginRight: 6 }} />
                <Text style={styles.contentSectionTitle}>5. Patient Data Privacy & Encryption</Text>
              </View>
              <Text style={styles.contentBody}>
                Your personal contact details and your pet's clinical medical records are strictly confidential, securely stored, and protected with industry-standard encryption. VetBook and BK Petaholic Veterinary Clinic will never sell or share your data with unauthorized third parties.
              </Text>
            </View>

            {/* Section 6 */}
            <View style={styles.contentSection}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="person-circle-outline" size={16} color={colors.primaryDeep} style={{ marginRight: 6 }} />
                <Text style={styles.contentSectionTitle}>6. Account Responsibility</Text>
              </View>
              <Text style={styles.contentBody}>
                You are responsible for maintaining the accuracy of your registered contact information, pet vital stats (age, weight, breed), and previous medical conditions or allergies. Providing accurate medical history helps our veterinarians deliver the highest standard of safe, tailored medical care.
              </Text>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actionContainer}>
            {showAcceptButton && (
              <TouchableOpacity
                style={styles.acceptBtn}
                onPress={handleAccept}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={acceptText}
              >
                <Ionicons name="checkmark-circle" size={18} color={colors.white} />
                <Text style={styles.acceptBtnText}>{acceptText}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(46,50,48,0.55)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
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
    borderBottomColor: colors.divider,
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
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.cardWarm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
  },
  modalScroll: {
    marginVertical: spacing.md,
  },
  scrollContent: {
    paddingBottom: spacing.sm,
  },
  contentSection: {
    marginBottom: spacing.md,
    backgroundColor: colors.cardWarm,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  contentSectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.primaryDeep,
    fontWeight: '700',
  },
  contentBody: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs + 1,
    color: colors.textTertiary,
    lineHeight: 18,
  },
  actionContainer: {
    paddingTop: spacing.xs,
  },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    height: 50,
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
    fontWeight: '700',
    color: colors.white,
  },
});

export default TermsModal;
