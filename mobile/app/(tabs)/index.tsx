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
  Clipboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore, MediaFormat } from '../../store/appStore';
import { useUsageStore } from '../../store/usageStore';
import { fetchInfo, startDownload, getJobStatus } from '../../services/api';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../../constants/theme';
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
  const heroGlow = useRef(new Animated.Value(0)).current;
  const [errorMsg, setErrorMsg] = useState('');
  const [showUsageGate, setShowUsageGate] = useState(false);
  const isFetchingRef = useRef(false);
  const activePollerIds = useRef<string[]>([]);

  const { canDownload, recordDownload } = useUsageStore();
  const { isConnected } = useNetworkStatus();

  // Subtle hero glow pulse
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(heroGlow, { toValue: 1, duration: 3000, useNativeDriver: true }),
        Animated.timing(heroGlow, { toValue: 0, duration: 3000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

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

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await Clipboard.getString();
      if (text && isValidUrl(text.trim())) {
        setInputUrl(text.trim());
        setErrorMsg('');
      } else {
        setErrorMsg('No valid URL found in clipboard');
      }
    } catch {
      setErrorMsg('Could not read clipboard');
    }
  }, []);

  const handleFetch = useCallback(async () => {
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
      if (info.isImage) setMediaType('image');
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
    if (!isConnected) {
      Alert.alert('Offline', 'You need internet to start a download.');
      return;
    }
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
      ...(selectedFormat.id.startsWith('torrent-file-') && {
        fileIndex: parseInt(selectedFormat.id.replace('torrent-file-', ''), 10),
      }),
    };

    try {
      const { jobId } = await startDownload(jobData);
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
      pollJobStatus(jobId);
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
    }, 1500);
    registerPoller(jobId, interval);
    activePollerIds.current.push(jobId);
  }, []);

  useEffect(() => {
    return () => {
      activePollerIds.current.forEach((id) => clearPoller(id));
      activePollerIds.current = [];
    };
  }, []);

  const videoFormats = mediaInfo?.formats.filter(f => f.type === 'video') || [];
  const audioFormats = mediaInfo?.formats.filter(f => f.type === 'audio') || [];
  const imageFormats = mediaInfo?.formats.filter(f => f.type === 'image') || [];
  const displayFormats = mediaType === 'audio' ? audioFormats
    : mediaType === 'image' ? imageFormats : videoFormats;
  const hasVideo = videoFormats.length > 0;
  const hasAudio = audioFormats.length > 0;
  const hasImage = imageFormats.length > 0;

  const glowOpacity = heroGlow.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.2] });

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <OfflineBanner />
          <UsageBanner onOpenFarm={() => setShowUsageGate(true)} />

          {/* ── Hero Section ── */}
          <View style={s.hero}>
            <Animated.View style={[s.heroGlow, { opacity: glowOpacity }]} />
            <View style={s.heroIconWrap}>
              <View style={s.heroIcon}>
                <Ionicons name="arrow-down-circle" size={32} color={Colors.accent.primary} />
              </View>
            </View>
            <Text style={s.heroTitle}>Paste. Pull. Done.</Text>
            <Text style={s.heroSub}>
              Share any link from any app — or paste it below.{'\n'}We handle the rest.
            </Text>
          </View>

          {/* ── URL Input Card ── */}
          <View style={s.inputCard}>
            <View style={s.inputRow}>
              <Ionicons name="link" size={18} color={Colors.accent.primary} />
              <TextInput
                style={s.urlInput}
                placeholder="Paste any media link..."
                placeholderTextColor={Colors.text.muted}
                value={inputUrl}
                onChangeText={(text) => { setInputUrl(text); setErrorMsg(''); }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={handleFetch}
                selectionColor={Colors.accent.primary}
              />
              {inputUrl.length > 0 ? (
                <TouchableOpacity onPress={() => { setInputUrl(''); setMediaInfo(null); setErrorMsg(''); }}>
                  <Ionicons name="close-circle" size={18} color={Colors.text.muted} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={handlePasteFromClipboard} style={s.pasteBtn}>
                  <Ionicons name="clipboard-outline" size={14} color={Colors.accent.primary} />
                  <Text style={s.pasteBtnText}>Paste</Text>
                </TouchableOpacity>
              )}
            </View>

            {errorMsg ? (
              <View style={s.errorRow}>
                <Ionicons name="warning" size={12} color={Colors.accent.error} />
                <Text style={s.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[s.fetchBtn, (!inputUrl.trim() || isFetchingInfo) && s.fetchBtnOff]}
              onPress={handleFetch}
              disabled={!inputUrl.trim() || isFetchingInfo}
              activeOpacity={0.8}
            >
              {isFetchingInfo ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="download-outline" size={18} color="#fff" />
                  <Text style={s.fetchBtnText}>Download</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Media Info Card ── */}
          {mediaInfo && (
            <Animated.View style={[s.mediaCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              <View style={s.thumbWrap}>
                {mediaInfo.thumbnail ? (
                  <Image source={{ uri: mediaInfo.thumbnail }} style={s.thumb} />
                ) : (
                  <View style={[s.thumb, s.thumbEmpty]}>
                    <Ionicons name="image-outline" size={40} color={Colors.text.muted} />
                  </View>
                )}
                {mediaInfo.duration > 0 && (
                  <View style={s.durBadge}>
                    <Text style={s.durText}>{formatDuration(mediaInfo.duration)}</Text>
                  </View>
                )}
              </View>

              <View style={s.mediaBody}>
                <Text style={s.mediaTitle} numberOfLines={2}>{mediaInfo.title}</Text>
                {mediaInfo.uploader ? (
                  <View style={s.uploaderRow}>
                    <Ionicons name="person-circle" size={14} color={Colors.text.muted} />
                    <Text style={s.uploaderText}>{mediaInfo.uploader}</Text>
                  </View>
                ) : null}
              </View>

              {/* Media Type Toggle */}
              <View style={s.toggleRow}>
                {hasVideo && (
                  <TouchableOpacity
                    style={[s.togBtn, mediaType === 'video' && s.togActive]}
                    onPress={() => { setMediaType('video'); if (videoFormats.length > 0) setSelectedFormat(videoFormats[0]); }}
                  >
                    <Ionicons name="videocam" size={14} color={mediaType === 'video' ? '#fff' : Colors.text.muted} />
                    <Text style={[s.togText, mediaType === 'video' && s.togTextOn]}>Video</Text>
                  </TouchableOpacity>
                )}
                {hasAudio && (
                  <TouchableOpacity
                    style={[s.togBtn, mediaType === 'audio' && s.togActive]}
                    onPress={() => { setMediaType('audio'); if (audioFormats.length > 0) setSelectedFormat(audioFormats[0]); }}
                  >
                    <Ionicons name="musical-notes" size={14} color={mediaType === 'audio' ? '#fff' : Colors.text.muted} />
                    <Text style={[s.togText, mediaType === 'audio' && s.togTextOn]}>Audio</Text>
                  </TouchableOpacity>
                )}
                {hasImage && (
                  <TouchableOpacity
                    style={[s.togBtn, mediaType === 'image' && s.togActive]}
                    onPress={() => { setMediaType('image'); if (imageFormats.length > 0) setSelectedFormat(imageFormats[0]); }}
                  >
                    <Ionicons name="image" size={14} color={mediaType === 'image' ? '#fff' : Colors.text.muted} />
                    <Text style={[s.togText, mediaType === 'image' && s.togTextOn]}>Image</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Format Selection */}
              {displayFormats.length > 0 && (
                <View style={s.fmtSection}>
                  <Text style={s.fmtLabel}>Quality & Format</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {displayFormats.map((fmt) => (
                      <TouchableOpacity
                        key={fmt.id}
                        style={[s.fmtChip, selectedFormat?.id === fmt.id && s.fmtChipOn]}
                        onPress={() => setSelectedFormat(fmt)}
                      >
                        <Text style={[s.fmtQ, selectedFormat?.id === fmt.id && s.fmtTextOn]}>{fmt.quality}</Text>
                        <Text style={[s.fmtExt, selectedFormat?.id === fmt.id && s.fmtTextOn]}>
                          {fmt.ext.toUpperCase()} • {formatBytes(fmt.filesize)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Download Button */}
              <TouchableOpacity style={s.dlBtn} onPress={handleDownload} activeOpacity={0.8}>
                <Ionicons name="cloud-download" size={20} color="#fff" />
                <Text style={s.dlBtnText}>
                  Download {selectedFormat ? `(${selectedFormat.quality} ${selectedFormat.ext.toUpperCase()})` : ''}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ── How It Works (when idle) ── */}
          {!mediaInfo && !isFetchingInfo && (
            <View style={s.howSection}>
              <Text style={s.howTitle}>How it works</Text>

              <View style={s.howCard}>
                <View style={[s.howIcon, { backgroundColor: '#A855F720' }]}>
                  <Ionicons name="share-social" size={20} color={Colors.accent.primary} />
                </View>
                <View style={s.howBody}>
                  <Text style={s.howStep}>Share to AYN</Text>
                  <Text style={s.howDesc}>From any app, tap Share → choose AYN. Download starts automatically.</Text>
                </View>
              </View>

              <View style={s.howCard}>
                <View style={[s.howIcon, { backgroundColor: '#6366F120' }]}>
                  <Ionicons name="clipboard" size={20} color="#6366F1" />
                </View>
                <View style={s.howBody}>
                  <Text style={s.howStep}>Paste a link</Text>
                  <Text style={s.howDesc}>Copy any media link, paste it above, and hit Download.</Text>
                </View>
              </View>

              <View style={s.howCard}>
                <View style={[s.howIcon, { backgroundColor: '#10B98120' }]}>
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                </View>
                <View style={s.howBody}>
                  <Text style={s.howStep}>We handle the rest</Text>
                  <Text style={s.howDesc}>Videos, audio, images — from almost any site. If a link is downloadable, we've got it.</Text>
                </View>
              </View>

              {/* Supported formats compact */}
              <View style={s.fmtCallout}>
                <Text style={s.fmtCalloutTitle}>Supported formats</Text>
                <View style={s.fmtCalloutRow}>
                  <View style={s.fmtDot} />
                  <Text style={s.fmtCalloutText}>Video: MP4, MKV, WebM, MOV</Text>
                </View>
                <View style={s.fmtCalloutRow}>
                  <View style={[s.fmtDot, { backgroundColor: '#7C3AED' }]} />
                  <Text style={s.fmtCalloutText}>Audio: MP3, AAC, FLAC, WAV</Text>
                </View>
                <View style={s.fmtCalloutRow}>
                  <View style={[s.fmtDot, { backgroundColor: '#10B981' }]} />
                  <Text style={s.fmtCalloutText}>Image: JPG, PNG, WebP, GIF</Text>
                </View>
                <View style={s.fmtCalloutRow}>
                  <View style={[s.fmtDot, { backgroundColor: '#9333EA' }]} />
                  <Text style={s.fmtCalloutText}>Torrent: Magnet links & .torrent</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <UsageGate
        visible={showUsageGate}
        onClose={() => setShowUsageGate(false)}
        onUnlocked={() => { setShowUsageGate(false); handleDownload(); }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: 120 },

  // ── Hero ──
  hero: { alignItems: 'center', paddingVertical: 28, marginBottom: 8 },
  heroGlow: {
    position: 'absolute', top: -20, width: 200, height: 200, borderRadius: 100,
    backgroundColor: Colors.accent.primary,
  },
  heroIconWrap: { marginBottom: 16 },
  heroIcon: {
    width: 56, height: 56, borderRadius: 18, backgroundColor: Colors.accent.glow,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.accent.primary + '30',
  },
  heroTitle: {
    fontSize: 26, fontWeight: '900', color: Colors.text.primary,
    letterSpacing: -0.5, marginBottom: 8,
  },
  heroSub: {
    fontSize: 14, color: Colors.text.muted, textAlign: 'center',
    lineHeight: 20, fontWeight: '500', paddingHorizontal: 20,
  },

  // ── Input Card ──
  inputCard: {
    backgroundColor: Colors.bg.card, borderRadius: BorderRadius.xl, padding: Spacing.md,
    marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.border.subtle, ...Shadows.card,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg.primary,
    borderRadius: BorderRadius.md, paddingHorizontal: 14, gap: 10,
    borderWidth: 1, borderColor: Colors.border.default,
  },
  urlInput: { flex: 1, height: 48, fontSize: 14, color: Colors.text.primary, fontWeight: '500' },
  pasteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.accent.primary + '15', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.accent.primary + '30',
  },
  pasteBtnText: { fontSize: 11, fontWeight: '700', color: Colors.accent.primary },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 4 },
  errorText: { color: Colors.accent.error, fontSize: 10, fontWeight: '600' },
  fetchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.accent.primary, borderRadius: BorderRadius.md,
    paddingVertical: 14, gap: 8, marginTop: Spacing.md, ...Shadows.glow,
  },
  fetchBtnOff: { opacity: 0.4 },
  fetchBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // ── Media Card ──
  mediaCard: {
    backgroundColor: Colors.bg.card, borderRadius: BorderRadius.xl, overflow: 'hidden',
    marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.border.subtle, ...Shadows.card,
  },
  thumbWrap: { position: 'relative', width: '100%', height: 200 },
  thumb: { width: '100%', height: '100%' },
  thumbEmpty: { backgroundColor: Colors.bg.elevated, alignItems: 'center', justifyContent: 'center' },
  durBadge: {
    position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  durText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  mediaBody: { padding: Spacing.md, paddingBottom: 0 },
  mediaTitle: { fontSize: 16, fontWeight: '700', color: Colors.text.primary, lineHeight: 22 },
  uploaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  uploaderText: { fontSize: 12, color: Colors.text.muted, fontWeight: '500' },

  // Toggle
  toggleRow: { flexDirection: 'row', gap: 8, padding: Spacing.md, paddingBottom: 0 },
  togBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: BorderRadius.full, backgroundColor: Colors.bg.elevated,
  },
  togActive: { backgroundColor: Colors.accent.primary },
  togText: { fontSize: 12, fontWeight: '700', color: Colors.text.muted },
  togTextOn: { color: '#fff' },

  // Format chips
  fmtSection: { padding: Spacing.md, paddingBottom: 0 },
  fmtLabel: { fontSize: 12, fontWeight: '700', color: Colors.text.secondary, marginBottom: 8, letterSpacing: 0.5 },
  fmtChip: {
    backgroundColor: Colors.bg.elevated, borderRadius: BorderRadius.md,
    paddingHorizontal: 14, paddingVertical: 10, marginRight: 8,
    borderWidth: 1.5, borderColor: 'transparent', minWidth: 90, alignItems: 'center',
  },
  fmtChipOn: { backgroundColor: Colors.accent.primary + '20', borderColor: Colors.accent.primary },
  fmtQ: { fontSize: 14, fontWeight: '800', color: Colors.text.secondary },
  fmtExt: { fontSize: 10, color: Colors.text.muted, marginTop: 2, fontWeight: '500' },
  fmtTextOn: { color: Colors.accent.primary },

  // Download button
  dlBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.accent.primary, margin: Spacing.md,
    borderRadius: BorderRadius.md, paddingVertical: 16, gap: 8, ...Shadows.glow,
  },
  dlBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  // ── How It Works ──
  howSection: { marginTop: 4 },
  howTitle: { fontSize: 18, fontWeight: '800', color: Colors.text.primary, marginBottom: 16, letterSpacing: -0.3 },
  howCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    backgroundColor: Colors.bg.card, borderRadius: BorderRadius.lg, padding: Spacing.md,
    marginBottom: 10, borderWidth: 1, borderColor: Colors.border.subtle,
  },
  howIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  howBody: { flex: 1 },
  howStep: { fontSize: 14, fontWeight: '700', color: Colors.text.primary, marginBottom: 4 },
  howDesc: { fontSize: 12, color: Colors.text.muted, lineHeight: 18, fontWeight: '500' },

  // Format callout
  fmtCallout: {
    backgroundColor: Colors.bg.card, borderRadius: BorderRadius.lg, padding: Spacing.md,
    marginTop: 6, borderWidth: 1, borderColor: Colors.border.subtle, gap: 8,
  },
  fmtCalloutTitle: { fontSize: 12, fontWeight: '700', color: Colors.text.secondary, letterSpacing: 0.5, marginBottom: 4 },
  fmtCalloutRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fmtDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent.primary },
  fmtCalloutText: { fontSize: 12, color: Colors.text.muted, fontWeight: '600' },
});
