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
 *  AYN Cinema-Grade Video Player
 * ═══════════════════════════════════════════════════
 */

interface VideoPlayerProps {
  visible: boolean;
  uri: string;
  title: string;
  thumbnail?: string;
  onClose: () => void;
  initialPosition?: number;
  onPositionUpdate?: (positionMs: number) => void;
}

const SKIP_SECONDS = 10;
const CONTROLS_HIDE_DELAY = 3500;
const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

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

  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  const [showControls, setShowControls] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [skipIndicator, setSkipIndicator] = useState<'left' | 'right' | null>(null);
  const skipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapTime = useRef(0);
  const lastTapSide = useRef<'left' | 'right' | null>(null);

  const [isSeeking, setIsSeeking] = useState(false);
  const seekPosition = useRef(0);

  const progress = duration > 0 ? position / duration : 0;

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
    if (showControls && isPlaying) scheduleHide();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [showControls, isPlaying, scheduleHide]);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) { setIsBuffering(true); return; }
    setIsLoaded(true);
    setIsBuffering(status.isBuffering);
    setIsPlaying(status.isPlaying);
    setPosition(status.positionMillis || 0);
    setDuration(status.durationMillis || 0);
    if (onPositionUpdate && status.positionMillis) onPositionUpdate(status.positionMillis);
    if (status.didJustFinish) {
      setIsPlaying(false);
      setShowControls(true);
      controlsOpacity.setValue(1);
    }
  }, [onPositionUpdate]);

  const handlePlayPause = useCallback(async () => {
    if (!videoRef.current) return;
    if (isPlaying) await videoRef.current.pauseAsync();
    else await videoRef.current.playAsync();
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

  const handleScreenTap = useCallback((event: any) => {
    const tapX = event.nativeEvent.locationX;
    const screenWidth = Dimensions.get('window').width;
    const now = Date.now();
    const side = tapX < screenWidth / 2 ? 'left' : 'right';
    if (now - lastTapTime.current < 300 && lastTapSide.current === side) {
      const skipSec = side === 'left' ? -SKIP_SECONDS : SKIP_SECONDS;
      handleSkip(skipSec);
      setSkipIndicator(side);
      if (skipTimer.current) clearTimeout(skipTimer.current);
      skipTimer.current = setTimeout(() => setSkipIndicator(null), 800);
      lastTapTime.current = 0;
      lastTapSide.current = null;
    } else {
      lastTapTime.current = now;
      lastTapSide.current = side;
      setTimeout(() => {
        if (Date.now() - lastTapTime.current >= 280) toggleControls();
      }, 300);
    }
  }, [handleSkip, toggleControls]);

  const progressPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => setIsSeeking(true),
      onPanResponderMove: (_, gestureState) => {
        const containerWidth = Dimensions.get('window').width - 48;
        const fraction = Math.max(0, Math.min(1, gestureState.moveX / containerWidth));
        seekPosition.current = fraction;
        setPosition(fraction * duration);
      },
      onPanResponderRelease: () => handleSeek(seekPosition.current),
    }),
  ).current;

  const handleClose = useCallback(async () => {
    if (videoRef.current) { try { await videoRef.current.pauseAsync(); } catch {} }
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (visible && videoRef.current && initialPosition > 0) {
      videoRef.current.setPositionAsync(initialPosition).catch(() => {});
    }
  }, [visible, initialPosition]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" supportedOrientations={['portrait', 'landscape']} onRequestClose={handleClose}>
      <StatusBar hidden />
      <View style={styles.container}>
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

        {/* Tap Layer */}
        <TouchableWithoutFeedback onPress={handleScreenTap}>
          <View style={styles.touchLayer}>
            {skipIndicator === 'left' && (
              <View style={[styles.skipIndicator, styles.skipLeft]}>
                <View style={styles.skipRipple}>
                  <Ionicons name="play-back" size={28} color="#fff" />
                  <Text style={styles.skipText}>{SKIP_SECONDS}s</Text>
                </View>
              </View>
            )}
            {skipIndicator === 'right' && (
              <View style={[styles.skipIndicator, styles.skipRight]}>
                <View style={styles.skipRipple}>
                  <Ionicons name="play-forward" size={28} color="#fff" />
                  <Text style={styles.skipText}>{SKIP_SECONDS}s</Text>
                </View>
              </View>
            )}
          </View>
        </TouchableWithoutFeedback>

        {/* Buffering */}
        {isBuffering && isLoaded && (
          <View style={styles.bufferingOverlay}>
            <View style={styles.bufferingRing}>
              <ActivityIndicator size="large" color={Colors.accent.primary} />
            </View>
          </View>
        )}

        {/* Initial Loading */}
        {!isLoaded && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingPulse}>
              <Ionicons name="play" size={36} color={Colors.accent.primary} />
            </View>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        )}

        {/* Controls */}
        {showControls && (
          <Animated.View style={[styles.controlsOverlay, { opacity: controlsOpacity }]}>
            {/* Gradient overlays */}
            <View style={styles.topGradient} />
            <View style={styles.bottomGradient} />

            {/* Top Bar */}
            <View style={styles.topBar}>
              <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                <Ionicons name="chevron-down" size={24} color="#fff" />
              </TouchableOpacity>
              <View style={styles.titleWrap}>
                <Text style={styles.nowPlaying}>NOW PLAYING</Text>
                <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSpeedMenu(!showSpeedMenu)} style={styles.speedBtn}>
                <Text style={styles.speedBtnText}>{playbackSpeed}x</Text>
              </TouchableOpacity>
            </View>

            {/* Speed Menu */}
            {showSpeedMenu && (
              <View style={styles.speedMenu}>
                <Text style={styles.speedMenuTitle}>Playback Speed</Text>
                {PLAYBACK_SPEEDS.map((speed) => (
                  <TouchableOpacity
                    key={speed}
                    style={[styles.speedOption, playbackSpeed === speed && styles.speedOptionActive]}
                    onPress={() => handleSpeedChange(speed)}
                  >
                    <Text style={[styles.speedOptionText, playbackSpeed === speed && styles.speedOptionTextActive]}>
                      {speed}x
                    </Text>
                    {playbackSpeed === speed && <Ionicons name="checkmark" size={16} color={Colors.accent.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Center Controls */}
            <View style={styles.centerControls}>
              <TouchableOpacity onPress={() => handleSkip(-SKIP_SECONDS)} style={styles.skipBtn}>
                <Ionicons name="play-back" size={26} color="rgba(255,255,255,0.9)" />
                <Text style={styles.skipBtnLabel}>{SKIP_SECONDS}</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handlePlayPause} style={styles.playPauseBtn}>
                <View style={styles.playPauseInner}>
                  <Ionicons name={isPlaying ? 'pause' : 'play'} size={36} color="#fff" />
                </View>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => handleSkip(SKIP_SECONDS)} style={styles.skipBtn}>
                <Ionicons name="play-forward" size={26} color="rgba(255,255,255,0.9)" />
                <Text style={styles.skipBtnLabel}>{SKIP_SECONDS}</Text>
              </TouchableOpacity>
            </View>

            {/* Bottom Bar */}
            <View style={styles.bottomBar}>
              <View style={styles.progressContainer} {...progressPanResponder.panHandlers}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressBuffer, { width: `${Math.min(progress * 100 + 10, 100)}%` }]} />
                  <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                  <View style={[styles.seekThumb, { left: `${progress * 100}%` }]} />
                </View>
              </View>
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatDuration(Math.floor(position / 1000))}</Text>
                <Text style={styles.timeSep}>  /  </Text>
                <Text style={styles.timeTextDim}>{formatDuration(Math.floor(duration / 1000))}</Text>
              </View>
            </View>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  video: { ...StyleSheet.absoluteFillObject },
  touchLayer: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', zIndex: 1 },

  // Skip indicators
  skipIndicator: { position: 'absolute', top: '30%', bottom: '30%', justifyContent: 'center', alignItems: 'center', width: 120 },
  skipLeft: { left: 0, borderTopRightRadius: 120, borderBottomRightRadius: 120, backgroundColor: 'rgba(255,255,255,0.08)' },
  skipRight: { right: 0, borderTopLeftRadius: 120, borderBottomLeftRadius: 120, backgroundColor: 'rgba(255,255,255,0.08)' },
  skipRipple: { alignItems: 'center', justifyContent: 'center' },
  skipText: { color: '#fff', fontSize: 12, fontWeight: '800', marginTop: 4 },

  // Buffering
  bufferingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  bufferingRing: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },

  // Loading
  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', zIndex: 3 },
  loadingPulse: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderWidth: 2, borderColor: 'rgba(168, 85, 247, 0.3)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  loadingText: { color: Colors.text.muted, fontSize: FontSize.sm, fontWeight: '600' },

  // Controls
  controlsOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', zIndex: 5, backgroundColor: 'rgba(0,0,0,0.4)' },
  topGradient: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 100,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  bottomGradient: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 120,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 54 : 24,
    paddingHorizontal: 20, gap: 14, zIndex: 10,
  },
  closeBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  titleWrap: { flex: 1 },
  nowPlaying: {
    fontSize: 9, fontWeight: '800', color: Colors.accent.primary,
    letterSpacing: 2, marginBottom: 3, textTransform: 'uppercase' as const,
  },
  titleText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  speedBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  speedBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '800' },

  // Speed menu
  speedMenu: {
    position: 'absolute', top: Platform.OS === 'ios' ? 100 : 70, right: 20,
    backgroundColor: 'rgba(15,15,25,0.97)', borderRadius: 16, padding: 12,
    zIndex: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    minWidth: 160,
  },
  speedMenuTitle: {
    fontSize: 10, fontWeight: '800', color: Colors.text.muted,
    letterSpacing: 1.5, textTransform: 'uppercase' as const,
    marginBottom: 8, paddingHorizontal: 8,
  },
  speedOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10,
  },
  speedOptionActive: { backgroundColor: Colors.accent.primary + '18' },
  speedOptionText: { color: Colors.text.secondary, fontSize: FontSize.md, fontWeight: '600' },
  speedOptionTextActive: { color: Colors.accent.primary, fontWeight: '800' },

  // Center
  centerControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 52, zIndex: 10 },
  playPauseBtn: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  playPauseInner: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  skipBtn: {
    alignItems: 'center', justifyContent: 'center',
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  skipBtnLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 8, fontWeight: '800', marginTop: 1 },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 44 : 28,
    zIndex: 10,
  },
  progressContainer: { height: 36, justifyContent: 'center', marginBottom: 4 },
  progressTrack: {
    height: 3, backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 2, overflow: 'visible', position: 'relative',
  },
  progressBuffer: {
    position: 'absolute', height: '100%', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2,
  },
  progressFill: {
    height: '100%', borderRadius: 2,
    backgroundColor: Colors.accent.primary,
  },
  seekThumb: {
    position: 'absolute', top: -7, width: 17, height: 17, borderRadius: 9,
    backgroundColor: '#fff', marginLeft: -8.5,
    borderWidth: 3, borderColor: Colors.accent.primary,
    shadowColor: Colors.accent.primary,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 10, elevation: 5,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  timeSep: { color: 'rgba(255,255,255,0.3)', fontSize: 12 },
  timeTextDim: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600' },
});
