// ALLYOUNEED (AYN) - Design System v3
// Premium dark theme — Cyan/Teal + Warm Coral accents
// Inspired by modern fintech/music apps (Spotify × Revolut)

export const Colors = {
  // Core backgrounds — deep navy/charcoal
  bg: {
    primary: '#060B14',
    secondary: '#0C1220',
    tertiary: '#111B2E',
    card: '#0F1724',
    elevated: '#162034',
    glass: 'rgba(12, 18, 32, 0.88)',
    overlay: 'rgba(0, 0, 0, 0.65)',
    input: '#0A1018',
  },
  // Accent colors — electric teal + warm coral
  accent: {
    primary: '#00D4FF',      // Electric cyan
    secondary: '#0EA5E9',    // Sky blue
    tertiary: '#06B6D4',     // Teal
    warm: '#FF6B6B',         // Coral
    warmLight: '#FFA07A',    // Light salmon
    gradient1: '#00D4FF',
    gradient2: '#0EA5E9',
    gradient3: '#06B6D4',
    glow: 'rgba(0, 212, 255, 0.12)',
    success: '#22C55E',
    warning: '#FBBF24',
    error: '#F43F5E',
    info: '#38BDF8',
  },
  // Text colors
  text: {
    primary: '#F0F6FC',
    secondary: '#8B9FC5',
    muted: '#4B6188',
    inverse: '#060B14',
    accent: '#67E8F9',
  },
  // Border colors
  border: {
    default: '#1A2744',
    focus: '#00D4FF',
    subtle: '#0F1C30',
    glass: 'rgba(255, 255, 255, 0.05)',
  },
  // Platform badges
  platform: {
    youtube: '#FF0033',
    instagram: '#E1306C',
    tiktok: '#00F2EA',
    twitter: '#1DA1F2',
    facebook: '#1877F2',
    reddit: '#FF4500',
    vimeo: '#1AB7EA',
    soundcloud: '#FF5500',
    twitch: '#9146FF',
    pinterest: '#E60023',
    flickr: '#0063DC',
    imgur: '#1BB76E',
    unsplash: '#111111',
    torrent: '#06B6D4',
    other: '#38BDF8',
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  full: 9999,
};

export const FontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 28,
  hero: 36,
  display: 48,
};

// Typography weights as constants
export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
  black: '900' as const,
};

// Shadows for glassmorphism
export const Shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  dock: {
    shadowColor: '#00D4FF',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 20,
  },
  glow: {
    shadowColor: '#00D4FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 10,
  },
  warmGlow: {
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 8,
  },
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
};

// Motion / animation presets
export const Motion = {
  duration: {
    instant: 100,
    fast: 200,
    normal: 350,
    slow: 500,
    glacial: 800,
  },
  spring: {
    snappy: { tension: 200, friction: 20 },
    gentle: { tension: 120, friction: 14 },
    bouncy: { tension: 180, friction: 12 },
  },
};

// API Configuration
export const API_BASE_URL = 'https://allyouneed-ia1i.onrender.com/v1';

export const PLATFORM_ICONS: Record<string, { icon: string; color: string }> = {
  youtube: { icon: 'logo-youtube', color: Colors.platform.youtube },
  instagram: { icon: 'logo-instagram', color: Colors.platform.instagram },
  tiktok: { icon: 'logo-tiktok', color: Colors.platform.tiktok },
  twitter: { icon: 'logo-twitter', color: Colors.platform.twitter },
  facebook: { icon: 'logo-facebook', color: Colors.platform.facebook },
  reddit: { icon: 'logo-reddit', color: Colors.platform.reddit },
  vimeo: { icon: 'logo-vimeo', color: Colors.platform.vimeo },
  soundcloud: { icon: 'logo-soundcloud', color: Colors.platform.soundcloud },
  twitch: { icon: 'logo-twitch', color: Colors.platform.twitch },
  pinterest: { icon: 'logo-pinterest', color: Colors.platform.pinterest },
  flickr: { icon: 'logo-flickr', color: Colors.platform.flickr },
  imgur: { icon: 'image-outline', color: Colors.platform.imgur },
  unsplash: { icon: 'camera-outline', color: Colors.platform.unsplash },
  torrent: { icon: 'magnet-outline', color: Colors.platform.torrent },
  other: { icon: 'globe-outline', color: Colors.platform.other },
};
