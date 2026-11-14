import { colors } from '../theme';

/**
 * Derives the clinic-controlled health status badge properties for a pet.
 * Controlled exclusively by clinic administrators via `pet.health_status`.
 */
export const getPetHealthStatus = (pet, { compact = false } = {}) => {
  const isAttention = pet?.health_status === 'attention';

  if (isAttention) {
    return {
      isAttention: true,
      label: compact ? 'Attention' : 'Needs Attention',
      bg: colors.amberLight,
      text: colors.amberDark,
      icon: 'alert-circle-outline',
    };
  }

  return {
    isAttention: false,
    label: 'Healthy',
    bg: colors.primaryPale,
    text: colors.primaryDeep,
    icon: 'shield-checkmark-outline',
  };
};

