// VetBook Design System — extracted from Figma
// All colors, fonts, spacing, and radii used across the app

export const colors = {
  // Primary greens
  primary: '#4A7C59',
  primaryLight: '#78A886',
  primaryPale: '#C8E8D0',
  primaryText: '#D8F0DE',
  primaryDeep: '#2A6038',
  primaryDarkest: '#002110',

  // Backgrounds
  background: '#FAF6F0',
  cardWarm: '#F5F1EA',
  cardBeige: '#F0ECE4',
  cardLightBeige: '#F0E8DB',
  cardYellow: '#F8E0A8',
  white: '#FFFFFF',
  divider: '#EAE6DE',

  // Text
  textPrimary: '#2E3230',
  textSecondary: '#6B6358',
  textTertiary: '#4A4E4A',
  textMuted: '#74796E',
  textOnPrimary: '#FFFFFF',

  // Accents
  amber: '#705C30',
  amberLight: '#F8E0A8',
  amberDark: '#554020',
  amberText: '#221A05',

  // Status
  alertRed: '#B83230',
  alertRedLight: '#FFDAD8',
  alertRedDark: '#690005',

  // Nav
  navActive: '#78A886',
  navInactive: '#4A4E4A',
  navActiveText: '#D8F0DE',
  navBackground: '#FFFFFF',

  // Borders and subtle
  border: 'rgba(196, 200, 188, 0.3)',
  borderStrong: 'rgba(196, 200, 188, 0.6)',
  borderDashed: '#C4C8BC',
};

export const fonts = {
  // Heading font (Literata)
  heading: 'Literata_700Bold',
  headingSemi: 'Literata_600SemiBold',
  headingBold: 'Literata_700Bold',

  // Body font (Nunito Sans)
  bodyRegular: 'NunitoSans_400Regular',
  bodyMedium: 'NunitoSans_500Medium',
  bodySemiBold: 'NunitoSans_600SemiBold',
  bodyBold: 'NunitoSans_700Bold',

  // Legacy fallback (system fonts)
  system: 'System',
};

export const fontSizes = {
  xs: 10,
  sm: 11,
  body: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 20,
  display: 24,
  hero: 30,
  mega: 36,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 9999,
};

export const shadows = {
  card: {
    shadowColor: '#2E3230',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
  },
  soft: {
    shadowColor: '#2E3230',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
};

export const statusColors = {
  pending: {
    bg: '#F8E0A8',
    text: '#554020',
    dot: '#705C30',
  },
  approved: {
    bg: '#C8E8D0',
    text: '#2A6038',
    dot: '#4A7C59',
  },
  completed: {
    bg: '#EAE6DE',
    text: '#4A4E4A',
    dot: '#74796E',
  },
  cancelled: {
    bg: '#FFDAD8',
    text: '#690005',
    dot: '#B83230',
  },
};

export default {
  colors,
  fonts,
  fontSizes,
  spacing,
  radii,
  shadows,
  statusColors,
};
