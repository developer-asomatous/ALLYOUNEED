import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Animated,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore, MediaFormat } from '../../store/appStore';
import { useUsageStore } from '../../store/usageStore';
import { fetchInfo, startDownload, getJobStatus } from '../../services/api';
import { Colors, Spacing, BorderRadius, FontSize, Shadows, PLATFORM_ICONS } from '../../constants/theme';
import { formatBytes, formatDuration, isValidUrl } from '../../utils/helpers';
import { registerPoller, clearPoller } from '../../services/downloadQueue';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import UsageBanner from '../../components/UsageBanner';
import UsageGate from '../../components/UsageGate';
import OfflineBanner from '../../components/OfflineBanner';

export default function HomeScreen() {
  const {
    inputUrl,
    setInputUrl,
    mediaInfo,
    setMediaInfo,
    isFetchingInfo,
    setFetchingInfo,
    selectedFormat,
    setSelectedFormat,
    mediaType,
    setMediaType,
    addDownload,
    updateDownload,
    resetMediaState,
  } = useAppStore();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const [errorMsg, setErrorMsg] = useState('');
  const [showUsageGate, setShowUsageGate] = useState(false);
  const isFetchingRef = useRef(false); // Debounce guard
  const activePollerIds = useRef<string[]>([]); // Track pollers for cleanup

  const { canDownload, recordDownload } = useUsageStore();
  const { isConnected } = useNetworkStatus();

  // Fade in media card
  useEffect(() => {
    if (mediaInfo) {
      fadeAnim.setValue(0);
      slideAnim.setValue(30);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();
    }
  }, [mediaInfo]);

  const handleFetch = useCallback(async () => {
    // Debounce: prevent double-tap
    if (isFetchingRef.current) return;
    if (!inputUrl.trim()) return;
    if (!isValidUrl(inputUrl.trim())) {
      setErrorMsg('Please enter a valid URL');
      return;
    }
    if (!isConnected) {
      setErrorMsg('No internet connection');
      return;
    }

    isFetchingRef.current = true;
    setErrorMsg('');
    setFetchingInfo(true);
    setMediaInfo(null);
    setSelectedFormat(null);

    try {
      const info = await fetchInfo(inputUrl.trim());
      setMediaInfo(info);

      // Auto-detect media type
      if (info.isImage) {
        setMediaType('image');
      }

      // Auto-select best format
      if (info.formats.length > 0) {
        const targetType = info.isImage ? 'image' : 'video';
        const typeFormats = info.formats.filter(f => f.type === targetType);
        setSelectedFormat(typeFormats[0] || info.formats[0]);
      }
    } catch (err: any) {
      const msg = err.isTimeout ? 'Request timed out — try again'
        : err.isNetworkError ? 'Network error — check connection'
        : err.message || 'Failed to fetch media info';
      setErrorMsg(msg);
    } finally {
      setFetchingInfo(false);
      isFetchingRef.current = false;
    }
  }, [inputUrl, isConnected]);

  const handleDownload = useCallback(async () => {
    if (!mediaInfo || !selectedFormat) return;

    // ── Network check ──
    if (!isConnected) {
      Alert.alert('Offline', 'You need internet to start a download.');
      return;
    }

    // ── Usage gate check ──
    if (!canDownload()) {
      setShowUsageGate(true);
      return;
    }

    const jobData = {
      url: mediaInfo.url,
      formatId: selectedFormat.id,
      outputFormat: selectedFormat.ext,
      audioOnly: mediaType === 'audio',
      imageOnly: mediaType === 'image',
      // For torrent downloads, extract file index from format ID
      ...(selectedFormat.id.startsWith('torrent-file-') && {
        fileIndex: parseInt(selectedFormat.id.replace('torrent-file-', ''), 10),
      }),
    };

    try {
      const { jobId } = await startDownload(jobData);

      // Record the download for usage tracking
      recordDownload();

      addDownload({
        id: jobId,
        url: mediaInfo.url,
        title: mediaInfo.title,
        thumbnail: mediaInfo.thumbnail,
        platform: mediaInfo.platform,
        status: 'downloading',
        progress: 0,
        speed: '0 B/s',
        eta: '--:--',
        format: selectedFormat.ext,
        quality: selectedFormat.quality,
        fileSize: selectedFormat.filesize || undefined,
        createdAt: Date.now(),
      });

      // Start polling with proper cleanup tracking
      pollJobStatus(jobId);

      // Reset and show success
      resetMediaState();
      Alert.alert('Download Started', `"${mediaInfo.title}" is downloading. Check the Library tab.`);
    } catch (err: any) {
      Alert.alert('Download Failed', err.message || 'Could not start download');
    }
  }, [mediaInfo, selectedFormat, mediaType, canDownload, isConnected]);

  const pollJobStatus = useCallback((jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const status = await getJobStatus(jobId);
        updateDownload(jobId, {
          status: status.status as any,
          progress: status.progress,
          speed: status.speed,
          eta: status.eta,
          error: status.error || undefined,
        });
        if (status.status === 'done' || status.status === 'failed') {
          clearPoller(jobId);
        }
      } catch {
        clearPoller(jobId);
      }
    }, 1500); // 1.5s intervals (reduced from 1s for battery)

    // Register poller for cleanup
    registerPoller(jobId, interval);
    activePollerIds.current.push(jobId);
  }, []);

  // ── Cleanup all pollers on unmount ──
  useEffect(() => {
    return () => {
      activePollerIds.current.forEach((id) => clearPoller(id));
      activePollerIds.current = [];
    };
  }, []);

  const platformInfo = PLATFORM_ICONS[mediaInfo?.platform || 'other'] || PLATFORM_ICONS.other;

  const videoFormats = mediaInfo?.formats.filter(f => f.type === 'video') || [];
  const audioFormats = mediaInfo?.formats.filter(f => f.type === 'audio') || [];
  const imageFormats = mediaInfo?.formats.filter(f => f.type === 'image') || [];

  const displayFormats = mediaType === 'audio' ? audioFormats
    : mediaType === 'image' ? imageFormats
    : videoFormats;

  const hasVideo = videoFormats.length > 0;
  const hasAudio = audioFormats.length > 0;
  const hasImage = imageFormats.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Offline Banner */}
          <OfflineBanner />

          {/* Usage Banner */}
          <UsageBanner onOpenFarm={() => setShowUsageGate(true)} />

          {/* ── Header ── */}
          <View style={styles.header}>
            <View style={styles.logoRow}>
              <View style={styles.logoBadge}>
                <Ionicons name="download" size={22} color={Colors.accent.primary} />
              </View>
              <View>
                <Text style={styles.logoText}>ALLYOUNEED</Text>
                <Text style={styles.tagline}>Paste. Pick. Pull.</Text>
              </View>
            </View>
          </View>

          {/* ── URL Input ── */}
          <View style={styles.inputCard}>
            <View style={styles.inputContainer}>
              <Ionicons name="link" size={18} color={Colors.accent.primary} style={styles.inputIcon} />
              <TextInput
                style={styles.urlInput}
                placeholder="Paste URL or magnet link..."
                placeholderTextColor={Colors.text.muted}
                value={inputUrl}
                onChangeText={(text) => {
                  setInputUrl(text);
                  setErrorMsg('');
                }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={handleFetch}
                selectionColor={Colors.accent.primary}
              />
              {inputUrl.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setInputUrl('');
                    setMediaInfo(null);
                    setErrorMsg('');
                  }}
                  style={styles.clearInputBtn}
                >
                  <Ionicons name="close-circle" size={18} color={Colors.text.muted} />
                </TouchableOpacity>
              )}
            </View>

            {errorMsg ? (
              <View style={styles.errorContainer}>
                <Ionicons name="warning" size={12} color={Colors.accent.error} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[
                styles.fetchButton,
                (!inputUrl.trim() || isFetchingInfo) && styles.fetchButtonDisabled,
              ]}
              onPress={handleFetch}
              disabled={!inputUrl.trim() || isFetchingInfo}
              activeOpacity={0.8}
            >
              {isFetchingInfo ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="search" size={18} color="#fff" />
                  <Text style={styles.fetchButtonText}>Fetch Media</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Media Info Card ── */}
          {mediaInfo && (
            <Animated.View
              style={[
                styles.mediaCard,
                { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
              ]}
            >
              {/* Thumbnail */}
              <View style={styles.thumbnailContainer}>
                {mediaInfo.thumbnail ? (
                  <Image source={{ uri: mediaInfo.thumbnail }} style={styles.thumbnail} />
                ) : (
                  <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
                    <Ionicons name="image-outline" size={40} color={Colors.text.muted} />
                  </View>
                )}
                {mediaInfo.duration > 0 && (
                  <View style={styles.durationBadge}>
                    <Text style={styles.durationText}>{formatDuration(mediaInfo.duration)}</Text>
                  </View>
                )}
                <View style={[styles.platformBadge, { backgroundColor: platformInfo.color }]}>
                  <Ionicons name={platformInfo.icon as any} size={12} color="#fff" />
                  <Text style={styles.platformText}>
                    {mediaInfo.platform.charAt(0).toUpperCase() + mediaInfo.platform.slice(1)}
                  </Text>
                </View>
                {mediaInfo.isImage && (
                  <View style={[styles.durationBadge, { backgroundColor: Colors.accent.info + 'DD' }]}>
                    <Ionicons name="image" size={12} color="#fff" />
                    <Text style={[styles.durationText, { marginLeft: 4 }]}>Image</Text>
                  </View>
                )}
              </View>

              {/* Title & Info */}
              <View style={styles.mediaInfoSection}>
                <Text style={styles.mediaTitle} numberOfLines={2}>
                  {mediaInfo.title}
                </Text>
                {mediaInfo.uploader ? (
                  <View style={styles.uploaderRow}>
                    <Ionicons name="person-circle" size={14} color={Colors.text.muted} />
                    <Text style={styles.uploaderText}>{mediaInfo.uploader}</Text>
                  </View>
                ) : null}
              </View>

              {/* Media Type Toggle */}
              <View style={styles.toggleSection}>
                {hasVideo && (
                  <TouchableOpacity
                    style={[styles.toggleBtn, mediaType === 'video' && styles.toggleActive]}
                    onPress={() => {
                      setMediaType('video');
                      if (videoFormats.length > 0) setSelectedFormat(videoFormats[0]);
                    }}
                  >
                    <Ionicons
                      name="videocam"
                      size={14}
                      color={mediaType === 'video' ? '#fff' : Colors.text.muted}
                    />
                    <Text style={[styles.toggleText, mediaType === 'video' && styles.toggleTextActive]}>
                      Video
                    </Text>
                  </TouchableOpacity>
                )}
                {hasAudio && (
                  <TouchableOpacity
                    style={[styles.toggleBtn, mediaType === 'audio' && styles.toggleActive]}
                    onPress={() => {
                      setMediaType('audio');
                      if (audioFormats.length > 0) setSelectedFormat(audioFormats[0]);
                    }}
                  >
                    <Ionicons
                      name="musical-notes"
                      size={14}
                      color={mediaType === 'audio' ? '#fff' : Colors.text.muted}
                    />
                    <Text style={[styles.toggleText, mediaType === 'audio' && styles.toggleTextActive]}>
                      Audio
                    </Text>
                  </TouchableOpacity>
                )}
                {hasImage && (
                  <TouchableOpacity
                    style={[styles.toggleBtn, mediaType === 'image' && styles.toggleActive]}
                    onPress={() => {
                      setMediaType('image');
                      if (imageFormats.length > 0) setSelectedFormat(imageFormats[0]);
                    }}
                  >
                    <Ionicons
                      name="image"
                      size={14}
                      color={mediaType === 'image' ? '#fff' : Colors.text.muted}
                    />
                    <Text style={[styles.toggleText, mediaType === 'image' && styles.toggleTextActive]}>
                      Image
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Format Selection */}
              {displayFormats.length > 0 && (
                <View style={styles.formatSection}>
                  <Text style={styles.sectionLabel}>
                    {mediaType === 'image' ? 'Image Format' : 'Quality & Format'}
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.formatScroll}>
                    {displayFormats.map((fmt) => (
                      <TouchableOpacity
                        key={fmt.id}
                        style={[
                          styles.formatChip,
                          selectedFormat?.id === fmt.id && styles.formatChipActive,
                        ]}
                        onPress={() => setSelectedFormat(fmt)}
                      >
                        <Text
                          style={[
                            styles.formatChipQuality,
                            selectedFormat?.id === fmt.id && styles.formatChipTextActive,
                          ]}
                        >
                          {fmt.quality}
                        </Text>
                        <Text
                          style={[
                            styles.formatChipExt,
                            selectedFormat?.id === fmt.id && styles.formatChipTextActive,
                          ]}
                        >
                          {fmt.ext.toUpperCase()} • {formatBytes(fmt.filesize)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Download Button */}
              <TouchableOpacity
                style={styles.downloadButton}
                onPress={handleDownload}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={mediaType === 'image' ? 'image' : 'cloud-download'}
                  size={20}
                  color="#fff"
                />
                <Text style={styles.downloadButtonText}>
                  Download {selectedFormat ? `(${selectedFormat.quality} ${selectedFormat.ext.toUpperCase()})` : ''}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ── Supported Platforms ── */}
          {!mediaInfo && !isFetchingInfo && (
            <View style={styles.platformsSection}>
              <Text style={styles.platformsSectionTitle}>Supported Platforms</Text>
              <View style={styles.platformsGrid}>
                {Object.entries(PLATFORM_ICONS).filter(([k]) => k !== 'other').map(([name, info]) => (
                  <View key={name} style={styles.platformItem}>
                    <View style={[styles.platformCircle, { backgroundColor: info.color + '15' }]}>
                      <Ionicons name={info.icon as any} size={18} color={info.color} />
                    </View>
                    <Text style={styles.platformName}>
                      {name.charAt(0).toUpperCase() + name.slice(1)}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Supported formats */}
              <View style={styles.formatsCallout}>
                <View style={styles.calloutRow}>
                  <View style={[styles.calloutIcon, { backgroundColor: Colors.accent.primary + '15' }]}>
                    <Ionicons name="videocam" size={14} color={Colors.accent.primary} />
                  </View>
                  <Text style={styles.calloutText}>Video: MP4, MKV, WebM, MOV</Text>
                </View>
                <View style={styles.calloutRow}>
                  <View style={[styles.calloutIcon, { backgroundColor: Colors.accent.secondary + '15' }]}>
                    <Ionicons name="musical-notes" size={14} color={Colors.accent.secondary} />
                  </View>
                  <Text style={styles.calloutText}>Audio: MP3, AAC, FLAC, WAV, OGG</Text>
                </View>
                <View style={styles.calloutRow}>
                  <View style={[styles.calloutIcon, { backgroundColor: Colors.accent.success + '15' }]}>
                    <Ionicons name="image" size={14} color={Colors.accent.success} />
                  </View>
                  <Text style={styles.calloutText}>Image: JPG, PNG, WebP, GIF, SVG</Text>
                </View>
                <View style={styles.calloutRow}>
                  <View style={[styles.calloutIcon, { backgroundColor: Colors.platform.torrent + '15' }]}>
                    <Ionicons name="magnet-outline" size={14} color={Colors.platform.torrent} />
                  </View>
                  <Text style={styles.calloutText}>Torrent: Magnet links & .torrent files</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Usage Gate Modal */}
      <UsageGate
        visible={showUsageGate}
        onClose={() => setShowUsageGate(false)}
        onUnlocked={() => {
          setShowUsageGate(false);
          handleDownload();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 120,
  },

  // ── Header ──
  header: {
    marginBottom: Spacing.lg,
    marginTop: Spacing.sm,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.accent.glow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.accent.primary + '30',
  },
  logoText: {
    fontSize: FontSize.xl,
    fontWeight: '900',
    color: Colors.text.primary,
    letterSpacing: 1.5,
  },
  tagline: {
    fontSize: FontSize.xs,
    color: Colors.text.muted,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 1,
  },

  // ── URL Input ──
  inputCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    ...Shadows.card,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  inputIcon: {
    marginRight: 8,
  },
  urlInput: {
    flex: 1,
    height: 48,
    fontSize: FontSize.md,
    color: Colors.text.primary,
    fontWeight: '500',
  },
  clearInputBtn: {
    padding: 4,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  errorText: {
    color: Colors.accent.error,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  fetchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    gap: 8,
    marginTop: Spacing.md,
  },
  fetchButtonDisabled: {
    opacity: 0.4,
  },
  fetchButtonText: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontWeight: '700',
  },

  // ── Media Card ──
  mediaCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    ...Shadows.card,
  },
  thumbnailContainer: {
    position: 'relative',
    width: '100%',
    height: 200,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    backgroundColor: Colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  durationText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  platformBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  platformText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '700',
  },

  // Media info
  mediaInfoSection: {
    padding: Spacing.md,
    paddingBottom: 0,
  },
  mediaTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text.primary,
    lineHeight: 22,
  },
  uploaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  uploaderText: {
    fontSize: FontSize.sm,
    color: Colors.text.muted,
    fontWeight: '500',
  },

  // Media type toggle
  toggleSection: {
    flexDirection: 'row',
    gap: 8,
    padding: Spacing.md,
    paddingBottom: 0,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  toggleActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  toggleText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text.muted,
  },
  toggleTextActive: {
    color: '#fff',
  },

  // Format selection
  formatSection: {
    padding: Spacing.md,
    paddingBottom: 0,
  },
  sectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text.secondary,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  formatScroll: {
    marginBottom: 0,
  },
  formatChip: {
    backgroundColor: Colors.bg.elevated,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
    minWidth: 90,
    alignItems: 'center',
  },
  formatChipActive: {
    backgroundColor: Colors.accent.primary + '20',
    borderColor: Colors.accent.primary,
  },
  formatChipQuality: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text.secondary,
  },
  formatChipExt: {
    fontSize: FontSize.xs,
    color: Colors.text.muted,
    marginTop: 2,
    fontWeight: '500',
  },
  formatChipTextActive: {
    color: Colors.accent.primary,
  },

  // Download button
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent.primary,
    margin: Spacing.md,
    borderRadius: BorderRadius.md,
    paddingVertical: 16,
    gap: 8,
    ...Shadows.glow,
  },
  downloadButtonText: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontWeight: '800',
  },

  // ── Platforms ──
  platformsSection: {
    marginTop: Spacing.sm,
  },
  platformsSectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: Spacing.md,
    letterSpacing: -0.3,
  },
  platformsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: Spacing.lg,
  },
  platformItem: {
    alignItems: 'center',
    width: 70,
    gap: 6,
  },
  platformCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformName: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.text.muted,
    textAlign: 'center',
    letterSpacing: 0.3,
  },

  // Formats callout
  formatsCallout: {
    backgroundColor: Colors.bg.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  calloutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  calloutIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calloutText: {
    fontSize: FontSize.sm,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
});
