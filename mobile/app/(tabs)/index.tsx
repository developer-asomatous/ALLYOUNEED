import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator, Animated, Alert, Platform, KeyboardAvoidingView, Clipboard, Dimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore, MediaFormat } from '../../store/appStore';
import { useUsageStore } from '../../store/usageStore';
import { fetchInfo, startDownload, getJobStatus } from '../../services/api';
import { Colors, Spacing, BorderRadius, FontSize, Shadows, API_BASE_URL } from '../../constants/theme';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { formatBytes, formatDuration, isValidUrl, isShortenerUrl, resolveRedirectUrl, scrapePageForLinks, ScrapedResult } from '../../utils/helpers';
import { registerPoller, clearPoller } from '../../services/downloadQueue';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import UsageBanner from '../../components/UsageBanner';
import UsageGate from '../../components/UsageGate';
import OfflineBanner from '../../components/OfflineBanner';
import { MediaCardSkeleton } from '../../components/SkeletonLoader';
import ToastNotification from '../../components/ToastNotification';
import { showDownloadStarted, showDownloadComplete, showDownloadFailed, updateDownloadProgress, shouldNotifyProgress, clearProgressThrottle } from '../../services/notifications';

const FETCH_STAGES = ['Resolving link...', 'Waking up server...', 'Fetching media info...', 'Processing formats...'];

export default function HomeScreen() {
  const { inputUrl, setInputUrl, mediaInfo, setMediaInfo, isFetchingInfo, setFetchingInfo, selectedFormat, setSelectedFormat, mediaType, setMediaType, addDownload, updateDownload, resetMediaState } = useAppStore();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const [errorMsg, setErrorMsg] = useState('');
  const [showUsageGate, setShowUsageGate] = useState(false);
  const [fetchStage, setFetchStage] = useState(0);
  const [toast, setToast] = useState<{ visible: boolean; type: 'success' | 'error' | 'info'; title: string; message?: string }>({ visible: false, type: 'info', title: '' });
  const isFetchingRef = useRef(false);
  const activePollerIds = useRef<string[]>([]);
  const { canDownload, recordDownload } = useUsageStore();
  const { isConnected } = useNetworkStatus();

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 3000, useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 0, duration: 3000, useNativeDriver: true }),
    ])).start();
  }, []);

  useEffect(() => {
    if (mediaInfo) {
      fadeAnim.setValue(0); slideAnim.setValue(30);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    }
  }, [mediaInfo]);

  // Staged loading messages
  useEffect(() => {
    if (!isFetchingInfo) { setFetchStage(0); return; }
    setFetchStage(0);
    const t1 = setTimeout(() => setFetchStage(1), 3000);
    const t2 = setTimeout(() => setFetchStage(2), 8000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isFetchingInfo]);

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await Clipboard.getString();
      if (text && isValidUrl(text.trim())) {
        setInputUrl(text.trim()); setErrorMsg('');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setErrorMsg('No valid URL in clipboard');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch { setErrorMsg('Could not read clipboard'); }
  }, []);

  const handleFetch = useCallback(async () => {
    if (isFetchingRef.current || !inputUrl.trim()) return;
    if (!isValidUrl(inputUrl.trim())) { setErrorMsg('Please enter a valid URL'); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); return; }
    if (!isConnected) { setErrorMsg('No internet connection'); return; }
    isFetchingRef.current = true; setErrorMsg(''); setFetchingInfo(true); setMediaInfo(null); setSelectedFormat(null);
    try {
      let resolvedUrl = inputUrl.trim();
      
      // For shortener URLs, scrape the page for links
      if (isShortenerUrl(resolvedUrl)) {
        setFetchStage(0); // 'Resolving link...'
        const scraped = await scrapePageForLinks(resolvedUrl);
        
        // If social media URL found, use backend
        if (scraped.mediaUrl) {
          resolvedUrl = scraped.mediaUrl;
          setInputUrl(resolvedUrl);
        } 
        // If direct download links found, present them directly
        else if (scraped.directLinks.length > 0) {
          const formats = scraped.directLinks.map((link, i) => ({
            id: `direct-${i}`,
            type: 'video' as const,
            quality: link.ext.toUpperCase(),
            ext: link.ext,
            filesize: null,
            label: link.filename,
            directUrl: link.url,
          }));
          
          setMediaInfo({
            url: resolvedUrl,
            title: scraped.directLinks[0].filename.replace(/\.[^.]+$/, '').replace(/[_.-]+/g, ' '),
            thumbnail: '',
            duration: 0,
            platform: 'direct',
            uploader: '',
            description: '',
            isImage: false,
            formats,
          });
          setSelectedFormat(formats[0]);
          setFetchingInfo(false);
          isFetchingRef.current = false;
          return; // Skip backend — direct download
        }
      }
      
      setFetchStage(2); // 'Fetching media info...'
      const info = await fetchInfo(resolvedUrl);
      setMediaInfo(info);
      if (info.isImage) setMediaType('image');
      if (info.formats.length > 0) {
        const targetType = info.isImage ? 'image' : 'video';
        const typeFormats = info.formats.filter(f => f.type === targetType);
        setSelectedFormat(typeFormats[0] || info.formats[0]);
      }
    } catch (err: any) {
      let msg = 'Something went wrong. Please try again.';
      // ONLY check backend-provided details, NOT err.message (which could be generic)
      const backendDetails = (err.details || '').toLowerCase();
      const errMessage = (err.message || '').toLowerCase();
      
      console.warn('[AYN-FETCH] Error:', JSON.stringify({ message: err.message, details: err.details, statusCode: err.statusCode, isTimeout: err.isTimeout, isNetworkError: err.isNetworkError }));
      
      if (err.isTimeout) {
        msg = 'Server is waking up — please try again in a moment';
      } else if (err.isNetworkError) {
        msg = 'No internet — check your connection and retry';
      } else if (backendDetails.includes('sign in') || backendDetails.includes('not a bot')) {
        // YouTube bot detection — server IP is blocked
        msg = 'YouTube is rate-limiting our server — please try again in a minute';
      } else if (backendDetails.includes('cookies') || backendDetails.includes('logged-in') || backendDetails.includes('authentication')) {
        // Instagram/private content login required
        msg = 'This content requires login — try a public link instead';
      } else if (backendDetails.includes('private') || backendDetails.includes('restricted')) {
        msg = 'This content is private or restricted';
      } else if (backendDetails.includes('not found') || backendDetails.includes('unavailable') || backendDetails.includes('deleted')) {
        msg = 'This content was removed or is unavailable';
      } else if (errMessage.includes('not supported') || errMessage.includes('unsupported')) {
        msg = 'This URL type is not supported yet';
      } else if (err.statusCode === 400) {
        msg = 'This URL is not supported';
      } else if (err.statusCode >= 500) {
        msg = 'Could not process this link — try a different one';
      }
      
      setErrorMsg(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setFetchingInfo(false); isFetchingRef.current = false; }
  }, [inputUrl, isConnected]);

  const handleDownload = useCallback(async () => {
    if (!mediaInfo || !selectedFormat) return;
    if (!isConnected) { Alert.alert('Offline', 'You need internet to start a download.'); return; }
    if (!canDownload()) { setShowUsageGate(true); return; }
    
    // Direct download (from scraped page links — no backend needed)
    if ((selectedFormat as any).directUrl) {
      const directUrl = (selectedFormat as any).directUrl;
      const filename = (selectedFormat as any).label || `download.${selectedFormat.ext}`;
      const localUri = `${FileSystem.documentDirectory}${filename}`;
      const jobId = `direct-${Date.now()}`;
      
      addDownload({ id: jobId, url: directUrl, title: mediaInfo.title, thumbnail: '', platform: 'direct', status: 'downloading', progress: 0, speed: '—', eta: '—', format: selectedFormat.ext, quality: selectedFormat.quality, createdAt: Date.now() });
      resetMediaState();
      showDownloadStarted(jobId, mediaInfo.title, 'Direct Download').catch(() => {});
      setToast({ visible: true, type: 'success', title: 'Download Started', message: `Downloading "${mediaInfo.title}"` });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Download in background
      try {
        const downloadResult = await FileSystem.downloadAsync(directUrl, localUri);
        if (downloadResult.status === 200) {
          updateDownload(jobId, { status: 'done', progress: 100, localUri: downloadResult.uri });
          const mediaExts = ['mp4', 'mkv', 'webm', 'mov', 'mp3', 'm4a'];
          if (mediaExts.includes(selectedFormat.ext)) {
            const { status: ps } = await MediaLibrary.requestPermissionsAsync();
            if (ps === 'granted') await MediaLibrary.saveToLibraryAsync(downloadResult.uri);
          }
          recordDownload();
          showDownloadComplete(jobId, mediaInfo.title).catch(() => {});
        } else {
          updateDownload(jobId, { status: 'failed', error: 'Download failed' });
          showDownloadFailed(jobId, mediaInfo.title, 'Download failed').catch(() => {});
        }
      } catch (err: any) {
        updateDownload(jobId, { status: 'failed', error: err.message || 'Download failed' });
        showDownloadFailed(jobId, mediaInfo.title, 'Download failed').catch(() => {});
      }
      return;
    }
    
    // Backend download (YouTube, Instagram, etc.)
    const jobData = { url: mediaInfo.url, formatId: selectedFormat.id, outputFormat: selectedFormat.ext, audioOnly: mediaType === 'audio', imageOnly: mediaType === 'image',
      ...(selectedFormat.id.startsWith('torrent-file-') && { fileIndex: parseInt(selectedFormat.id.replace('torrent-file-', ''), 10) }),
    };
    try {
      const { jobId } = await startDownload(jobData);
      addDownload({ id: jobId, url: mediaInfo.url, title: mediaInfo.title, thumbnail: mediaInfo.thumbnail, platform: mediaInfo.platform, status: 'downloading', progress: 0, speed: '0 B/s', eta: '--:--', format: selectedFormat.ext, quality: selectedFormat.quality, fileSize: selectedFormat.filesize || undefined, createdAt: Date.now() });
      pollJobStatus(jobId, mediaInfo.title);
      resetMediaState();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showDownloadStarted(jobId, mediaInfo.title, mediaInfo.platform).catch(() => {});
      setToast({ visible: true, type: 'success', title: 'Download Started', message: `"${mediaInfo.title}" is downloading` });
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Oops!', 'Could not start download. Please try again.');
    }
  }, [mediaInfo, selectedFormat, mediaType, canDownload, isConnected]);

  const pollJobStatus = useCallback((jobId: string, title: string) => {
    const interval = setInterval(async () => {
      try {
        const status = await getJobStatus(jobId);
        updateDownload(jobId, { status: status.status as any, progress: status.progress, speed: status.speed, eta: status.eta, error: status.error || undefined });
        if (shouldNotifyProgress(jobId)) { updateDownloadProgress(jobId, title, status.progress, status.speed).catch(() => {}); }
        if (status.status === 'done') {
          recordDownload(); clearPoller(jobId); clearProgressThrottle(jobId);
          showDownloadComplete(jobId, title).catch(() => {});
          try {
            const dl = useAppStore.getState().downloads.find(d => d.id === jobId);
            if (dl) {
              const ext = dl.format || 'mp4';
              const safeName = (dl.title || 'download').replace(/[^a-zA-Z0-9_\-. ]/g, '').substring(0, 50).trim();
              const filename = `${safeName}_${jobId}.${ext}`;
              const streamUrl = API_BASE_URL.replace('/v1', '') + `/v1/stream/${jobId}`;
              const localUri = `${FileSystem.cacheDirectory}${filename}`;
              const downloadResult = await FileSystem.downloadAsync(streamUrl, localUri);
              if (downloadResult.status === 200) {
                updateDownload(jobId, { localUri: downloadResult.uri });
                const mediaExts = ['mp4', 'mkv', 'webm', 'mov', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'mp3', 'm4a'];
                if (mediaExts.includes(ext)) {
                  const { status: ps } = await MediaLibrary.requestPermissionsAsync();
                  if (ps === 'granted') await MediaLibrary.saveToLibraryAsync(downloadResult.uri);
                }
              }
            }
          } catch (e: any) { console.warn('[AYN] Auto-save failed:', e.message); }
        } else if (status.status === 'failed') {
          clearPoller(jobId); clearProgressThrottle(jobId);
          showDownloadFailed(jobId, title, status.error || undefined).catch(() => {});
        }
      } catch { clearPoller(jobId); }
    }, 1500);
    registerPoller(jobId, interval); activePollerIds.current.push(jobId);
  }, []);

  useEffect(() => { return () => { activePollerIds.current.forEach(id => clearPoller(id)); activePollerIds.current = []; }; }, []);

  const videoFormats = mediaInfo?.formats.filter(f => f.type === 'video') || [];
  const audioFormats = mediaInfo?.formats.filter(f => f.type === 'audio') || [];
  const imageFormats = mediaInfo?.formats.filter(f => f.type === 'image') || [];
  const displayFormats = mediaType === 'audio' ? audioFormats : mediaType === 'image' ? imageFormats : videoFormats;
  const hasVideo = videoFormats.length > 0; const hasAudio = audioFormats.length > 0; const hasImage = imageFormats.length > 0;
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.18] });

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <OfflineBanner />
          <UsageBanner onOpenFarm={() => setShowUsageGate(true)} />

          {/* ── Header ── */}
          <View style={s.header}>
            <Animated.View style={[s.headerGlow, { opacity: glowOpacity }]} />
            <View style={s.brandRow}>
              <View style={s.brandIcon}><Ionicons name="arrow-down-circle" size={22} color={Colors.accent.primary} /></View>
              <Text style={s.brandName}>AYN</Text>
            </View>
            <Text style={s.headerTitle}>Grab anything.{'\n'}From anywhere.</Text>
            <Text style={s.headerSub}>Share a link or paste it below — we handle the rest.</Text>
          </View>

          {/* ── URL Input ── */}
          <View style={s.inputCard}>
            <View style={s.inputRow}>
              <Ionicons name="link" size={16} color={Colors.accent.primary} />
              <TextInput style={s.urlInput} placeholder="Paste any media link..." placeholderTextColor={Colors.text.muted} value={inputUrl}
                onChangeText={t => { setInputUrl(t); setErrorMsg(''); }} autoCapitalize="none" autoCorrect={false} returnKeyType="go" onSubmitEditing={handleFetch} selectionColor={Colors.accent.primary} />
              {inputUrl.length > 0 ? (
                <TouchableOpacity onPress={() => { setInputUrl(''); setMediaInfo(null); setErrorMsg(''); }}><Ionicons name="close-circle" size={18} color={Colors.text.muted} /></TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={handlePasteFromClipboard} style={s.pasteBtn}><Ionicons name="clipboard-outline" size={13} color={Colors.accent.primary} /><Text style={s.pasteBtnText}>Paste</Text></TouchableOpacity>
              )}
            </View>
            {errorMsg ? <View style={s.errorRow}><Ionicons name="alert-circle" size={13} color={Colors.accent.error} /><Text style={s.errorText}>{errorMsg}</Text></View> : null}
            <TouchableOpacity style={[s.fetchBtn, (!inputUrl.trim() || isFetchingInfo) && s.fetchBtnOff]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleFetch(); }} disabled={!inputUrl.trim() || isFetchingInfo} activeOpacity={0.8}>
              {isFetchingInfo ? <><ActivityIndicator color="#fff" size="small" /><Text style={s.fetchBtnText}>{FETCH_STAGES[fetchStage]}</Text></> : <><Ionicons name="search" size={17} color="#fff" /><Text style={s.fetchBtnText}>Fetch & Download</Text></>}
            </TouchableOpacity>
          </View>

          {/* ── Skeleton while loading ── */}
          {isFetchingInfo && <MediaCardSkeleton />}

          {/* ── Media Info Card ── */}
          {mediaInfo && (
            <Animated.View style={[s.mediaCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              <View style={s.thumbWrap}>
                {mediaInfo.thumbnail ? <Image source={{ uri: mediaInfo.thumbnail }} style={s.thumb} /> : <View style={[s.thumb, s.thumbEmpty]}><Ionicons name="image-outline" size={40} color={Colors.text.muted} /></View>}
                {mediaInfo.duration > 0 && <View style={s.durBadge}><Text style={s.durText}>{formatDuration(mediaInfo.duration)}</Text></View>}
              </View>
              <View style={s.mediaBody}>
                <Text style={s.mediaTitle} numberOfLines={2}>{mediaInfo.title}</Text>
                {mediaInfo.uploader ? <View style={s.uploaderRow}><Ionicons name="person-circle" size={14} color={Colors.text.muted} /><Text style={s.uploaderText}>{mediaInfo.uploader}</Text></View> : null}
              </View>
              {/* Type Toggle */}
              <View style={s.toggleRow}>
                {hasVideo && <TouchableOpacity style={[s.togBtn, mediaType === 'video' && s.togActive]} onPress={() => { setMediaType('video'); if (videoFormats.length > 0) setSelectedFormat(videoFormats[0]); }}>
                  <Ionicons name="videocam" size={14} color={mediaType === 'video' ? Colors.bg.primary : Colors.text.muted} /><Text style={[s.togText, mediaType === 'video' && s.togTextOn]}>Video</Text></TouchableOpacity>}
                {hasAudio && <TouchableOpacity style={[s.togBtn, mediaType === 'audio' && s.togActive]} onPress={() => { setMediaType('audio'); if (audioFormats.length > 0) setSelectedFormat(audioFormats[0]); }}>
                  <Ionicons name="musical-notes" size={14} color={mediaType === 'audio' ? Colors.bg.primary : Colors.text.muted} /><Text style={[s.togText, mediaType === 'audio' && s.togTextOn]}>Audio</Text></TouchableOpacity>}
                {hasImage && <TouchableOpacity style={[s.togBtn, mediaType === 'image' && s.togActive]} onPress={() => { setMediaType('image'); if (imageFormats.length > 0) setSelectedFormat(imageFormats[0]); }}>
                  <Ionicons name="image" size={14} color={mediaType === 'image' ? Colors.bg.primary : Colors.text.muted} /><Text style={[s.togText, mediaType === 'image' && s.togTextOn]}>Image</Text></TouchableOpacity>}
              </View>
              {/* Format Selection */}
              {displayFormats.length > 0 && (
                <View style={s.fmtSection}><Text style={s.fmtLabel}>QUALITY & FORMAT</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {displayFormats.map(fmt => (
                      <TouchableOpacity key={fmt.id} style={[s.fmtChip, selectedFormat?.id === fmt.id && s.fmtChipOn]} onPress={() => setSelectedFormat(fmt)}>
                        <Text style={[s.fmtQ, selectedFormat?.id === fmt.id && s.fmtTextOn]}>{fmt.quality}</Text>
                        <Text style={[s.fmtExt, selectedFormat?.id === fmt.id && s.fmtTextOn]}>{fmt.ext.toUpperCase()} • {formatBytes(fmt.filesize)}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
              <TouchableOpacity style={s.dlBtn} onPress={handleDownload} activeOpacity={0.8}>
                <Ionicons name="cloud-download" size={20} color={Colors.bg.primary} />
                <Text style={s.dlBtnText}>Download {selectedFormat ? `(${selectedFormat.quality} ${selectedFormat.ext.toUpperCase()})` : ''}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ── Idle — How it works ── */}
          {!mediaInfo && !isFetchingInfo && (
            <View style={s.howSection}>
              <Text style={s.howTitle}>How it works</Text>
              {[
                { icon: 'share-social', color: Colors.accent.primary, bg: Colors.accent.primary + '15', title: 'Share to AYN', desc: 'From any app, tap Share → choose AYN. Download starts automatically.' },
                { icon: 'clipboard', color: Colors.accent.info, bg: Colors.accent.info + '15', title: 'Paste a link', desc: 'Copy any media link, paste it above, and hit Fetch & Download.' },
                { icon: 'checkmark-circle', color: Colors.accent.success, bg: Colors.accent.success + '15', title: 'We handle the rest', desc: 'Videos, audio, images — from almost any site. If it\'s downloadable, we\'ve got it.' },
              ].map((item, i) => (
                <View key={i} style={s.howCard}>
                  <View style={[s.howIcon, { backgroundColor: item.bg }]}><Ionicons name={item.icon as any} size={20} color={item.color} /></View>
                  <View style={s.howBody}><Text style={s.howStep}>{item.title}</Text><Text style={s.howDesc}>{item.desc}</Text></View>
                </View>
              ))}
              <View style={s.fmtCallout}>
                <Text style={s.fmtCalloutTitle}>SUPPORTED FORMATS</Text>
                {[
                  { label: 'Video: MP4, MKV, WebM, MOV', color: Colors.accent.primary },
                  { label: 'Audio: MP3, AAC, FLAC, WAV', color: Colors.accent.info },
                  { label: 'Image: JPG, PNG, WebP, GIF', color: Colors.accent.success },
                  { label: 'Torrent: Magnet links & .torrent', color: Colors.accent.tertiary },
                ].map((f, i) => (
                  <View key={i} style={s.fmtCalloutRow}><View style={[s.fmtDot, { backgroundColor: f.color }]} /><Text style={s.fmtCalloutText}>{f.label}</Text></View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <UsageGate visible={showUsageGate} onClose={() => setShowUsageGate(false)} onUnlocked={() => { setShowUsageGate(false); handleDownload(); }} />
      <ToastNotification visible={toast.visible} type={toast.type} title={toast.title} message={toast.message} onDismiss={() => setToast(t => ({ ...t, visible: false }))} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: 120 },
  // Header
  header: { alignItems: 'flex-start', marginBottom: Spacing.lg, paddingTop: 8, position: 'relative' },
  headerGlow: { position: 'absolute', top: -60, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: Colors.accent.primary },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  brandIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.accent.primary + '18', borderWidth: 1, borderColor: Colors.accent.primary + '30', alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 13, fontWeight: '800', color: Colors.accent.primary, letterSpacing: 4 },
  headerTitle: { fontSize: 30, fontWeight: '900', color: Colors.text.primary, letterSpacing: -0.8, lineHeight: 38 },
  headerSub: { fontSize: 14, color: Colors.text.secondary, marginTop: 8, lineHeight: 21, fontWeight: '500' },
  // Input
  inputCard: { backgroundColor: Colors.bg.card, borderRadius: BorderRadius.xl, padding: Spacing.md, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.border.subtle, ...Shadows.card },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg.input, borderRadius: BorderRadius.md, paddingHorizontal: 14, gap: 10, borderWidth: 1, borderColor: Colors.border.default },
  urlInput: { flex: 1, height: 48, fontSize: 14, color: Colors.text.primary, fontWeight: '500' },
  pasteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.accent.primary + '12', paddingHorizontal: 10, paddingVertical: 6, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.accent.primary + '25' },
  pasteBtnText: { fontSize: 11, fontWeight: '700', color: Colors.accent.primary },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: Colors.accent.error + '0A', borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.accent.error + '18' },
  errorText: { color: Colors.accent.error, fontSize: 12, fontWeight: '600', flex: 1 },
  fetchBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accent.primary, borderRadius: BorderRadius.md, paddingVertical: 14, gap: 8, marginTop: Spacing.md, ...Shadows.glow },
  fetchBtnOff: { opacity: 0.4 },
  fetchBtnText: { color: Colors.bg.primary, fontSize: 15, fontWeight: '700' },
  // Media Card
  mediaCard: { backgroundColor: Colors.bg.card, borderRadius: BorderRadius.xl, overflow: 'hidden', marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.border.subtle, ...Shadows.card },
  thumbWrap: { position: 'relative', width: '100%', height: 200 },
  thumb: { width: '100%', height: '100%' },
  thumbEmpty: { backgroundColor: Colors.bg.elevated, alignItems: 'center', justifyContent: 'center' },
  durBadge: { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  durText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  mediaBody: { padding: Spacing.md, paddingBottom: 0 },
  mediaTitle: { fontSize: 16, fontWeight: '700', color: Colors.text.primary, lineHeight: 22 },
  uploaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  uploaderText: { fontSize: 12, color: Colors.text.muted, fontWeight: '500' },
  // Toggle
  toggleRow: { flexDirection: 'row', gap: 8, padding: Spacing.md, paddingBottom: 0 },
  togBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.full, backgroundColor: Colors.bg.elevated },
  togActive: { backgroundColor: Colors.accent.primary },
  togText: { fontSize: 12, fontWeight: '700', color: Colors.text.muted },
  togTextOn: { color: Colors.bg.primary },
  // Format chips
  fmtSection: { padding: Spacing.md, paddingBottom: 0 },
  fmtLabel: { fontSize: 10, fontWeight: '800', color: Colors.text.muted, marginBottom: 8, letterSpacing: 1.5 },
  fmtChip: { backgroundColor: Colors.bg.elevated, borderRadius: BorderRadius.md, paddingHorizontal: 14, paddingVertical: 10, marginRight: 8, borderWidth: 1.5, borderColor: 'transparent', minWidth: 90, alignItems: 'center' },
  fmtChipOn: { backgroundColor: Colors.accent.primary + '18', borderColor: Colors.accent.primary },
  fmtQ: { fontSize: 14, fontWeight: '800', color: Colors.text.secondary },
  fmtExt: { fontSize: 10, color: Colors.text.muted, marginTop: 2, fontWeight: '500' },
  fmtTextOn: { color: Colors.accent.primary },
  // Download button
  dlBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accent.primary, margin: Spacing.md, borderRadius: BorderRadius.md, paddingVertical: 16, gap: 8, ...Shadows.glow },
  dlBtnText: { color: Colors.bg.primary, fontSize: 16, fontWeight: '800' },
  // How It Works
  howSection: { marginTop: 4 },
  howTitle: { fontSize: 18, fontWeight: '800', color: Colors.text.primary, marginBottom: 16, letterSpacing: -0.3 },
  howCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, backgroundColor: Colors.bg.card, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: 10, borderWidth: 1, borderColor: Colors.border.subtle },
  howIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  howBody: { flex: 1 },
  howStep: { fontSize: 14, fontWeight: '700', color: Colors.text.primary, marginBottom: 4 },
  howDesc: { fontSize: 12, color: Colors.text.muted, lineHeight: 18, fontWeight: '500' },
  fmtCallout: { backgroundColor: Colors.bg.card, borderRadius: BorderRadius.lg, padding: Spacing.md, marginTop: 6, borderWidth: 1, borderColor: Colors.border.subtle, gap: 8 },
  fmtCalloutTitle: { fontSize: 10, fontWeight: '800', color: Colors.text.muted, letterSpacing: 1.5, marginBottom: 4 },
  fmtCalloutRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fmtDot: { width: 6, height: 6, borderRadius: 3 },
  fmtCalloutText: { fontSize: 12, color: Colors.text.muted, fontWeight: '600' },
});
