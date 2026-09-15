export const COLORS = {
  background: '#050707',
  surface: '#090B0B',
  surfaceLight: '#0D1010',
  glass: 'rgba(255, 255, 255, 0.05)', // Extremely subtle glass
  // Opaque lift for bars that sit over scrolling content (mini player, tab bar).
  // These must not be translucent: blur is unreliable on Android, so content
  // would otherwise read straight through them.
  surfaceRaised: '#121616',
  hairline: 'rgba(255, 255, 255, 0.08)',
  glassBorder: 'rgba(255, 255, 255, 0.1)', // 1px borders
  
  text: {
    primary: '#F0F0F0',
    secondary: '#888888',
    muted: '#555555',
  },
  
  accent: {
    green: '#1DB954', // Subtle Spotify-like green but a bit distinct
    greenGlow: 'rgba(29, 185, 84, 0.15)',
    red: '#FF4444',
    redGlow: 'rgba(255, 68, 68, 0.15)',
  },
  
  player: {
    progressTrack: 'rgba(255, 255, 255, 0.2)',
    progressFill: '#FFFFFF',
  }
};

export const SIZES = {
  /**
   * Clearance a scrolling screen must leave at the bottom so the last row is
   * never trapped under the tab bar + mini player.
   */
  bottomInset: 150,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
  radius: {
    sm: 8,
    md: 16,
    lg: 24,
    pill: 999,
  }
};

export const FONTS = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
};

export const SHADOWS = {
  glass: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10, // For Android
  },
  ambient: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  }
};
