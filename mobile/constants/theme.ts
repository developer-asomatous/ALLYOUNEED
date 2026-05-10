// ALLYOUNEED (AYN) - Design Constants v2
// Premium dark theme with glassmorphism & dock-style navigation

export const Colors = {
  // Core palette — deeper, richer darks
  bg: {
    primary: '#09090F',
    secondary: '#111118',
    tertiary: '#19192A',
    card: '#13131F',
    elevated: '#1C1C30',
    glass: 'rgba(18, 18, 28, 0.85)',
    overlay: 'rgba(0, 0, 0, 0.6)',
  },
  // Accent colors — vibrant purple/indigo gradient system
  accent: {
    primary: '#A855F7',     // Purple
    secondary: '#7C3AED',   // Deep violet
    gradient1: '#A855F7',
    gradient2: '#6366F1',
    gradient3: '#EC4899',   // Pink
    glow: 'rgba(168, 85, 247, 0.15)',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
  },
  // Text colors
  text: {
    primary: '#F1F5F9',
    secondary: '#94A3B8',
    muted: '#64748B',
    inverse: '#09090F',
    accent: '#C084FC',
  },
  // Border colors
  border: {
    default: '#1E293B',
    focus: '#A855F7',
    subtle: '#161625',
    glass: 'rgba(255, 255, 255, 0.06)',
  },
  // Platform badges
  platform: {
    youtube: '#FF0000',
    instagram: '#E4405F',
    tiktok: '#000000',
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
    torrent: '#9333EA',
    other: '#6366F1',
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
  xl: 24,
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

// Shadows for glassmorphism
export const Shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  dock: {
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  glow: {
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
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
