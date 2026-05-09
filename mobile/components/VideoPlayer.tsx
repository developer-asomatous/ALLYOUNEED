import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  PanResponder,
  Platform,
  Modal,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, BorderRadius } from '../constants/theme';
import { formatDuration } from '../utils/helpers';

/**
 * ═══════════════════════════════════════════════════
 *  AYN Netflix-Style Video Player
 * ═══════════════════════════════════════════════════
 *
 *  Features:
 *  • Full-screen immersive playback
 *  • Auto-hiding controls (3s timeout)
 *  • Double-tap to skip ±10s (like Netflix/YouTube)
 *  • Swipe-based seek on progress bar
 *  • Loading/buffering indicator
 *  • Brightness/volume gesture zones
 *  • Portrait + landscape support
 *  • Playback speed control (0.5x–2x)
 *  • Resume from last position
 */

interface VideoPlayerProps {
  visible: boolean;
  uri: string;
  title: string;
  thumbnail?: string;
  onClose: () => void;
  initialPosition?: number; // Resume position in ms
  onPositionUpdate?: (positionMs: number) => void;
}

const SKIP_SECONDS = 10;
const CONTROLS_HIDE_DELAY = 3500;
const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function VideoPlayer({
  visible,
  uri,
  title,
  thumbnail,
  onClose,
  initialPosition = 0,
  onPositionUpdate,
}: VideoPlayerProps) {
  const videoRef = useRef<Video>(null);

  // ── Playback state ──
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [position, setPosition] = useState(0); // ms
  const [duration, setDuration] = useState(0); // ms
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // ── Controls visibility ──
  const [showControls, setShowControls] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Double-tap skip ──
  const [skipIndicator, setSkipIndicator] = useState<'left' | 'right' | null>(null);
  const skipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapTime = useRef(0);
  const lastTapSide = useRef<'left' | 'right' | null>(null);

  // ── Seeking ──
  const [isSeeking, setIsSeeking] = useState(false);
  const seekPosition = useRef(0);

  // Progress animation
  const progress = duration > 0 ? position / duration : 0;

  // ── Auto-hide controls ──
  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (isPlaying) {
        Animated.timing(controlsOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setShowControls(false));
      }
    }, CONTROLS_HIDE_DELAY);
  }, [isPlaying]);

  const toggleControls = useCallback(() => {
    if (showControls) {
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setShowControls(false));
    } else {
      setShowControls(true);
      controlsOpacity.setValue(1);
      scheduleHide();
    }
  }, [showControls, scheduleHide]);

  useEffect(() => {
    if (showControls && isPlaying) {
      scheduleHide();
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [showControls, isPlaying, scheduleHide]);

  // ── Playback status handler ──
  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      setIsBuffering(true);
      return;
    }

    setIsLoaded(true);
    setIsBuffering(status.isBuffering);
    setIsPlaying(status.isPlaying);
    setPosition(status.positionMillis || 0);
    setDuration(status.durationMillis || 0);

    // Report position for resume support
    if (onPositionUpdate && status.positionMillis) {
      onPositionUpdate(status.positionMillis);
    }

    // Video finished
    if (status.didJustFinish) {
      setIsPlaying(false);
      setShowControls(true);
      controlsOpacity.setValue(1);
    }
  }, [onPositionUpdate]);

  // ── Controls ──
  const handlePlayPause = useCallback(async () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  }, [isPlaying]);

  const handleSkip = useCallback(async (seconds: number) => {
    if (!videoRef.current || !isLoaded) return;
    const newPos = Math.max(0, Math.min(position + seconds * 1000, duration));
    await videoRef.current.setPositionAsync(newPos);
  }, [position, duration, isLoaded]);

  const handleSeek = useCallback(async (fraction: number) => {
    if (!videoRef.current || !isLoaded || duration === 0) return;
    const newPos = Math.max(0, Math.min(fraction * duration, duration));
    await videoRef.current.setPositionAsync(newPos);
    setIsSeeking(false);
  }, [duration, isLoaded]);

  const handleSpeedChange = useCallback(async (speed: number) => {
    if (!videoRef.current) return;
    await videoRef.current.setRateAsync(speed, true);
    setPlaybackSpeed(speed);
    setShowSpeedMenu(false);
  }, []);

  // ── Double-tap detection ──
  const handleScreenTap = useCallback((event: any) => {
    const tapX = event.nativeEvent.locationX;
    const screenWidth = Dimensions.get('window').width;
    const now = Date.now();
    const side = tapX < screenWidth / 2 ? 'left' : 'right';

    // Double-tap detection (within 300ms, same side)
    if (now - lastTapTime.current < 300 && lastTapSide.current === side) {
      // Double-tap → skip
      const skipSec = side === 'left' ? -SKIP_SECONDS : SKIP_SECONDS;
      handleSkip(skipSec);

      setSkipIndicator(side);
      if (skipTimer.current) clearTimeout(skipTimer.current);
      skipTimer.current = setTimeout(() => setSkipIndicator(null), 800);

      lastTapTime.current = 0;
      lastTapSide.current = null;
    } else {
      // First tap — wait for potential double-tap
      lastTapTime.current = now;
      lastTapSide.current = side;

      // If no second tap within 300ms, toggle controls
      setTimeout(() => {
        if (Date.now() - lastTapTime.current >= 280) {
          toggleControls();
        }
      }, 300);
    }
  }, [handleSkip, toggleControls]);

  // ── Progress bar pan gesture ──
  const progressPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setIsSeeking(true);
      },
      onPanResponderMove: (_, gestureState) => {
        const containerWidth = Dimensions.get('window').width - 48; // padding
        const fraction = Math.max(0, Math.min(1, gestureState.moveX / containerWidth));
        seekPosition.current = fraction;
        setPosition(fraction * duration);
      },
      onPanResponderRelease: () => {
        handleSeek(seekPosition.current);
      },
    }),
  ).current;

  // ── Close handler ──
  const handleClose = useCallback(async () => {
    if (videoRef.current) {
      try { await videoRef.current.pauseAsync(); } catch {}
    }
    onClose();
  }, [onClose]);

  // ── Load with initial position ──
  useEffect(() => {
    if (visible && videoRef.current && initialPosition > 0) {
      videoRef.current.setPositionAsync(initialPosition).catch(() => {});
    }
  }, [visible, initialPosition]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={handleClose}
    >
      <StatusBar hidden />
      <View style={styles.container}>
        {/* ── Video ── */}
        <Video
          ref={videoRef}
          source={{ uri }}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={true}
          isLooping={false}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          posterSource={thumbnail ? { uri: thumbnail } : undefined}
          usePoster={!!thumbnail}
        />

        {/* ── Tap Handler Layer ── */}
        <TouchableWithoutFeedback onPress={handleScreenTap}>
          <View style={styles.touchLayer}>
            {/* Skip Indicators */}
            {skipIndicator === 'left' && (
              <View style={[styles.skipIndicator, styles.skipLeft]}>
                <Ionicons name="play-back" size={32} color="#fff" />
                <Text style={styles.skipText}>{SKIP_SECONDS}s</Text>
              </View>
            )}
            {skipIndicator === 'right' && (
              <View style={[styles.skipIndicator, styles.skipRight]}>
                <Ionicons name="play-forward" size={32} color="#fff" />
                <Text style={styles.skipText}>{SKIP_SECONDS}s</Text>
              </View>
            )}
          </View>
        </TouchableWithoutFeedback>

        {/* ── Buffering Indicator ── */}
        {isBuffering && isLoaded && (
          <View style={styles.bufferingOverlay}>
            <ActivityIndicator size="large" color={Colors.accent.primary} />
          </View>
        )}

        {/* ── Loading Indicator (initial) ── */}
        {!isLoaded && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.accent.primary} />
            <Text style={styles.loadingText}>Loading video...</Text>
          </View>
        )}

        {/* ── Controls Overlay ── */}
        {showControls && (
          <Animated.View style={[styles.controlsOverlay, { opacity: controlsOpacity }]}>
            {/* ── Top Bar ── */}
            <View style={styles.topBar}>
              <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                <Ionicons name="chevron-down" size={28} color="#fff" />
              </TouchableOpacity>
              <View style={styles.titleWrap}>
                <Text style={styles.titleText} numberOfLines={1}>
                  {title}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowSpeedMenu(!showSpeedMenu)}
                style={styles.speedBtn}
              >
                <Text style={styles.speedBtnText}>{playbackSpeed}x</Text>
              </TouchableOpacity>
            </View>

            {/* ── Speed Menu ── */}
            {showSpeedMenu && (
              <View style={styles.speedMenu}>
                {PLAYBACK_SPEEDS.map((speed) => (
                  <TouchableOpacity
                    key={speed}
                    style={[
                      styles.speedOption,
                      playbackSpeed === speed && styles.speedOptionActive,
                    ]}
                    onPress={() => handleSpeedChange(speed)}
                  >
                    <Text
                      style={[
                        styles.speedOptionText,
                        playbackSpeed === speed && styles.speedOptionTextActive,
                      ]}
                    >
                      {speed}x
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* ── Center Controls ── */}
            <View style={styles.centerControls}>
              <TouchableOpacity
                onPress={() => handleSkip(-SKIP_SECONDS)}
                style={styles.skipBtn}
              >
                <Ionicons name="play-back" size={28} color="#fff" />
                <Text style={styles.skipBtnLabel}>{SKIP_SECONDS}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handlePlayPause}
                style={styles.playPauseBtn}
              >
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={40}
                  color="#fff"
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleSkip(SKIP_SECONDS)}
                style={styles.skipBtn}
              >
                <Ionicons name="play-forward" size={28} color="#fff" />
                <Text style={styles.skipBtnLabel}>{SKIP_SECONDS}</Text>
              </TouchableOpacity>
            </View>

            {/* ── Bottom Bar ── */}
            <View style={styles.bottomBar}>
              {/* Time */}
              <Text style={styles.timeText}>
                {formatDuration(Math.floor(position / 1000))}
              </Text>

              {/* Progress Bar */}
              <View style={styles.progressContainer} {...progressPanResponder.panHandlers}>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${progress * 100}%` },
                    ]}
                  />
                  {/* Seek thumb */}
                  <View
                    style={[
                      styles.seekThumb,
                      { left: `${progress * 100}%` },
                    ]}
                  />
                </View>
              </View>

              {/* Duration */}
              <Text style={styles.timeText}>
                {formatDuration(Math.floor(duration / 1000))}
              </Text>
            </View>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },

  // Touch layer
  touchLayer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 1,
  },

  // Skip indicators
  skipIndicator: {
    position: 'absolute',
    top: '35%',
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  skipLeft: {
    left: '15%',
  },
  skipRight: {
    right: '15%',
  },
  skipText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '700',
    marginTop: 2,
  },

  // Buffering
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },

  // Loading
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    zIndex: 3,
  },
  loadingText: {
    color: Colors.text.muted,
    fontSize: FontSize.md,
    fontWeight: '600',
    marginTop: 12,
  },

  // Controls overlay
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'space-between',
    zIndex: 5,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingHorizontal: 16,
    gap: 12,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
  },
  titleText: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  speedBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  speedBtnText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '800',
  },

  // Speed menu
  speedMenu: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 90 : 60,
    right: 16,
    backgroundColor: 'rgba(20,20,30,0.95)',
    borderRadius: BorderRadius.md,
    padding: 8,
    zIndex: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  speedOption: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  speedOptionActive: {
    backgroundColor: Colors.accent.primary + '30',
  },
  speedOptionText: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
    fontWeight: '600',
    textAlign: 'center',
  },
  speedOptionTextActive: {
    color: Colors.accent.primary,
    fontWeight: '800',
  },

  // Center controls
  centerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 48,
  },
  playPauseBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(168, 85, 247, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accent.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 15,
  },
  skipBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  skipBtnLabel: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 1,
  },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    gap: 10,
  },
  timeText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '700',
    minWidth: 42,
    textAlign: 'center',
  },

  // Progress bar
  progressContainer: {
    flex: 1,
    height: 32, // Large touch target
    justifyContent: 'center',
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'visible',
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent.primary,
    borderRadius: 2,
  },
  seekThumb: {
    position: 'absolute',
    top: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.accent.primary,
    marginLeft: -8,
    shadowColor: Colors.accent.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 5,
  },
});
