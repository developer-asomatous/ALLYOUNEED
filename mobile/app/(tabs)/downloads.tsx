import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, Alert, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { useAppStore, DownloadJob } from '../../store/appStore';
import { Colors, Spacing, BorderRadius, FontSize, Shadows, PLATFORM_ICONS, API_BASE_URL } from '../../constants/theme';
import { formatBytes, timeAgo } from '../../utils/helpers';
import VideoPlayer from '../../components/VideoPlayer';

const ITEM_HEIGHT = 130;
const ITEM_MARGIN = 8;
const FULL_ITEM_HEIGHT = ITEM_HEIGHT + ITEM_MARGIN;

function DownloadItem({ item, onPlay }: { item: DownloadJob; onPlay: (item: DownloadJob) => void }) {
  const { removeDownload, updateDownload } = useAppStore();
  const platformInfo = PLATFORM_ICONS[item.platform] || PLATFORM_ICONS.other;
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const statusColor = { queued: Colors.text.muted, fetching: Colors.accent.info, downloading: Colors.accent.primary, processing: Colors.accent.warning, done: Colors.accent.success, failed: Colors.accent.error }[item.status];
  const statusLabel = { queued: 'Queued', fetching: 'Fetching...', downloading: `${Math.round(item.progress)}%`, processing: 'Processing...', done: 'Complete', failed: 'Failed' }[item.status];

  const ensureLocalFile = useCallback(async (): Promise<string | null> => {
    if (item.localUri) { try { const info = await FileSystem.getInfoAsync(item.localUri); if (info.exists) return item.localUri; } catch {} }
    const ext = item.format || 'mp4';
    const safeName = (item.title || 'download').replace(/[^a-zA-Z0-9_\-. ]/g, '').substring(0, 50).trim();
    const filename = `${safeName}_${item.id}.${ext}`;
    const localUri = `${FileSystem.cacheDirectory}${filename}`;
    const streamUrl = API_BASE_URL.replace('/v1', '') + `/v1/stream/${item.id}`;
    try {
      const downloadResult = await FileSystem.downloadAsync(streamUrl, localUri);
      if (downloadResult.status !== 200) throw new Error(`HTTP ${downloadResult.status}`);
      updateDownload(item.id, { localUri: downloadResult.uri });
      return downloadResult.uri;
    } catch (err: any) { Alert.alert('Download Error', `Could not fetch file: ${err.message}`); return null; }
  }, [item]);

  const handleShare = useCallback(async () => {
    setIsSharing(true);
    try {
      const localPath = await ensureLocalFile(); if (!localPath) return;
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) { Alert.alert('Sharing Not Available'); return; }
      await Sharing.shareAsync(localPath, { mimeType: getMimeType(item.format || 'mp4'), dialogTitle: `Share "${item.title}"` });
    } catch (err: any) { Alert.alert('Share Error', err.message || 'Failed to share'); } finally { setIsSharing(false); }
  }, [item, ensureLocalFile]);

  const handleSaveToGallery = useCallback(async () => {
    setIsSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Needed', 'Please grant media library access.'); return; }
      const localPath = await ensureLocalFile(); if (!localPath) return;
      await MediaLibrary.saveToLibraryAsync(localPath);
      Alert.alert('Saved! ✅', `"${item.title}" saved to gallery.`);
    } catch (err: any) {
      if (err.message?.includes('not supported')) Alert.alert('Not Supported', "This file type can't be saved to gallery.");
      else Alert.alert('Save Error', err.message || 'Failed to save');
    } finally { setIsSaving(false); }
  }, [item, ensureLocalFile]);

  const handlePlay = useCallback(async () => {
    if (['mp4', 'mkv', 'webm', 'mov'].includes(item.format || '')) { onPlay(item); return; }
    setIsLoading(true);
    try {
      const localPath = await ensureLocalFile(); if (!localPath) return;
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) await Sharing.shareAsync(localPath, { mimeType: getMimeType(item.format || 'mp4'), UTI: getUTI(item.format || 'mp4') });
      else Alert.alert('Cannot Open');
    } catch (err: any) { Alert.alert('Open Error', err.message); } finally { setIsLoading(false); }
  }, [item, ensureLocalFile, onPlay]);

  const handleDelete = () => {
    Alert.alert('Remove Download', `Remove "${item.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        if (item.localUri) { try { await FileSystem.deleteAsync(item.localUri, { idempotent: true }); } catch {} }
        removeDownload(item.id);
      }},
    ]);
  };

  const isMediaFile = ['mp4', 'mkv', 'webm', 'mov', 'jpg', 'jpeg', 'png', 'gif', 'webp'].includes(item.format || '');
  const isVideoFile = ['mp4', 'mkv', 'webm', 'mov'].includes(item.format || '');

  return (
    <View style={styles.downloadItem}>
      <TouchableOpacity style={styles.thumbWrap} onPress={item.status === 'done' ? handlePlay : undefined} activeOpacity={item.status === 'done' ? 0.7 : 1}>
        {item.thumbnail ? <Image source={{ uri: item.thumbnail }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbPlaceholder]}><Ionicons name="musical-notes" size={20} color={Colors.text.muted} /></View>}
        {item.status === 'done' && <View style={styles.playOverlay}><Ionicons name="play" size={20} color="#fff" /></View>}
        <View style={[styles.platformDot, { backgroundColor: platformInfo.color }]}><Ionicons name={platformInfo.icon as any} size={8} color="#fff" /></View>
      </TouchableOpacity>
      <View style={styles.downloadInfo}>
        <Text style={styles.downloadTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.metaRow}>
          {item.format && <View style={styles.metaChip}><Text style={styles.metaChipText}>{item.format.toUpperCase()}</Text></View>}
          {item.quality && <View style={styles.metaChip}><Text style={styles.metaChipText}>{item.quality}</Text></View>}
          {item.fileSize && <Text style={styles.metaText}>{formatBytes(item.fileSize)}</Text>}
        </View>
        {(item.status === 'downloading' || item.status === 'processing') && (
          <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${Math.min(item.progress, 100)}%`, backgroundColor: statusColor }]} /></View>
        )}
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          {item.status === 'downloading' && <Text style={styles.speedText}>{item.speed} • ETA {item.eta}</Text>}
          <Text style={styles.timeText}>{timeAgo(item.createdAt)}</Text>
        </View>
        {item.status === 'done' && (
          <View style={styles.doneActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={handlePlay} disabled={isLoading}>
              {isLoading ? <ActivityIndicator size="small" color={Colors.accent.primary} /> : <><Ionicons name={isVideoFile ? 'play-circle' : 'open-outline'} size={16} color={Colors.accent.primary} /><Text style={styles.actionBtnText}>{isVideoFile ? 'Play' : 'Open'}</Text></>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleShare} disabled={isSharing}>
              {isSharing ? <ActivityIndicator size="small" color={Colors.accent.info} /> : <><Ionicons name="share-outline" size={16} color={Colors.accent.info} /><Text style={[styles.actionBtnText, { color: Colors.accent.info }]}>Share</Text></>}
            </TouchableOpacity>
            {isMediaFile && (
              <TouchableOpacity style={styles.actionBtn} onPress={handleSaveToGallery} disabled={isSaving}>
                {isSaving ? <ActivityIndicator size="small" color={Colors.accent.success} /> : <><Ionicons name="download-outline" size={16} color={Colors.accent.success} /><Text style={[styles.actionBtnText, { color: Colors.accent.success }]}>Save</Text></>}
              </TouchableOpacity>
            )}
          </View>
        )}
        {item.status === 'failed' && item.error && <Text style={styles.errorText} numberOfLines={2}>{item.error}</Text>}
      </View>
      <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}><Ionicons name="trash-outline" size={14} color={Colors.accent.error} /></TouchableOpacity>
    </View>
  );
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = { mp4: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', wav: 'audio/wav', ogg: 'audio/ogg', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
  return map[ext] || 'application/octet-stream';
}
function getUTI(ext: string): string {
  const map: Record<string, string> = { mp4: 'public.mpeg-4', mkv: 'public.movie', webm: 'public.movie', mov: 'com.apple.quicktime-movie', mp3: 'public.mp3', m4a: 'public.mpeg-4-audio', jpg: 'public.jpeg', jpeg: 'public.jpeg', png: 'public.png' };
  return map[ext] || 'public.data';
}

export default function DownloadsScreen() {
  const { downloads, clearCompleted, updateDownload } = useAppStore();
  const [playerVisible, setPlayerVisible] = useState(false);
  const [playerItem, setPlayerItem] = useState<DownloadJob | null>(null);
  const [playerUri, setPlayerUri] = useState('');

  const activeDownloads = downloads.filter(d => d.status !== 'done' && d.status !== 'failed');
  const completedDownloads = downloads.filter(d => d.status === 'done');
  const failedDownloads = downloads.filter(d => d.status === 'failed');

  const handlePlayItem = useCallback(async (item: DownloadJob) => {
    let uri = '';
    if (item.localUri) { try { const info = await FileSystem.getInfoAsync(item.localUri); if (info.exists) uri = item.localUri; } catch {} }
    if (!uri) uri = API_BASE_URL.replace('/v1', '') + `/v1/stream/${item.id}`;
    setPlayerItem(item); setPlayerUri(uri); setPlayerVisible(true);
  }, []);

  const handlePositionUpdate = useCallback((positionMs: number) => {
    if (playerItem) updateDownload(playerItem.id, { lastPlaybackPosition: positionMs });
  }, [playerItem, updateDownload]);

  const getItemLayout = useCallback((_: any, index: number) => ({ length: FULL_ITEM_HEIGHT, offset: FULL_ITEM_HEIGHT * index, index }), []);
  const renderItem = useCallback(({ item }: { item: DownloadJob }) => <DownloadItem item={item} onPlay={handlePlayItem} />, [handlePlayItem]);
  const keyExtractor = useCallback((item: DownloadJob) => item.id, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View><Text style={styles.headerTitle}>Library</Text><Text style={styles.headerSub}>{downloads.length} item{downloads.length !== 1 ? 's' : ''}</Text></View>
        {completedDownloads.length > 0 && (
          <TouchableOpacity onPress={clearCompleted} style={styles.clearBtn}><Ionicons name="checkmark-done" size={14} color={Colors.accent.primary} /><Text style={styles.clearText}>Clear Done</Text></TouchableOpacity>
        )}
      </View>
      <View style={styles.statsBar}>
        {[
          { icon: 'arrow-down', color: Colors.accent.primary, value: activeDownloads.length, label: 'Active' },
          { icon: 'checkmark', color: Colors.accent.success, value: completedDownloads.length, label: 'Done' },
          { icon: 'close', color: Colors.accent.error, value: failedDownloads.length, label: 'Failed' },
        ].map((stat, i) => (
          <View key={i} style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: stat.color + '15' }]}><Ionicons name={stat.icon as any} size={14} color={stat.color} /></View>
            <Text style={styles.statValue}>{stat.value}</Text><Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>
      {downloads.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}><Ionicons name="cloud-download-outline" size={48} color={Colors.text.muted} /></View>
          <Text style={styles.emptyTitle}>No downloads yet</Text>
          <Text style={styles.emptySubtext}>Paste a URL on the Home tab to start downloading</Text>
        </View>
      ) : (
        <FlatList data={downloads} keyExtractor={keyExtractor} renderItem={renderItem} getItemLayout={getItemLayout} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} maxToRenderPerBatch={8} windowSize={5} initialNumToRender={6} removeClippedSubviews={Platform.OS === 'android'} />
      )}
      <VideoPlayer visible={playerVisible} uri={playerUri} title={playerItem?.title || ''} thumbnail={playerItem?.thumbnail} initialPosition={playerItem?.lastPlaybackPosition || 0} onPositionUpdate={handlePositionUpdate} onClose={() => { setPlayerVisible(false); setPlayerItem(null); setPlayerUri(''); }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, paddingTop: Spacing.sm },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.text.primary, letterSpacing: -0.5 },
  headerSub: { fontSize: FontSize.sm, color: Colors.text.muted, fontWeight: '500', marginTop: 2 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.accent.primary + '12', borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.accent.primary + '20' },
  clearText: { color: Colors.accent.primary, fontSize: FontSize.sm, fontWeight: '700' },
  statsBar: { flexDirection: 'row', marginHorizontal: Spacing.lg, backgroundColor: Colors.bg.card, borderRadius: BorderRadius.lg, padding: Spacing.sm, marginBottom: Spacing.md, gap: Spacing.sm },
  statItem: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 6 },
  statIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text.primary },
  statLabel: { fontSize: FontSize.xs, color: Colors.text.muted, fontWeight: '600' },
  listContent: { padding: Spacing.lg, paddingTop: 0, paddingBottom: 120 },
  downloadItem: { flexDirection: 'row', backgroundColor: Colors.bg.card, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: ITEM_MARGIN, borderWidth: 1, borderColor: Colors.border.subtle },
  thumbWrap: { position: 'relative', marginRight: Spacing.md },
  thumb: { width: 64, height: 64, borderRadius: BorderRadius.md },
  thumbPlaceholder: { backgroundColor: Colors.bg.elevated, alignItems: 'center', justifyContent: 'center' },
  playOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  platformDot: { position: 'absolute', bottom: -3, right: -3, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.bg.card },
  downloadInfo: { flex: 1 },
  downloadTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text.primary, lineHeight: 18, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6, flexWrap: 'wrap' },
  metaChip: { backgroundColor: Colors.bg.elevated, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  metaChipText: { fontSize: 9, fontWeight: '700', color: Colors.text.secondary, letterSpacing: 0.5 },
  metaText: { fontSize: FontSize.xs, color: Colors.text.muted, fontWeight: '500' },
  progressBar: { height: 3, backgroundColor: Colors.bg.primary, borderRadius: 2, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: '100%', borderRadius: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: FontSize.xs, fontWeight: '700' },
  speedText: { fontSize: FontSize.xs, color: Colors.text.muted, fontWeight: '500' },
  timeText: { fontSize: FontSize.xs, color: Colors.text.muted, fontWeight: '500', marginLeft: 'auto' },
  doneActions: { flexDirection: 'row', gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border.subtle },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: Colors.bg.elevated, borderRadius: BorderRadius.sm },
  actionBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.accent.primary },
  deleteBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.accent.error + '10', alignItems: 'center', justifyContent: 'center', marginLeft: 6, alignSelf: 'flex-start' },
  errorText: { fontSize: FontSize.xs, color: Colors.accent.error, marginTop: 4, fontWeight: '500' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 120 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.bg.card, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text.secondary, marginBottom: 6 },
  emptySubtext: { fontSize: FontSize.md, color: Colors.text.muted, textAlign: 'center', maxWidth: 250 },
});
