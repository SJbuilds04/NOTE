import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { X, Check, Trash2 } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { COLORS, SIZES, FONTS } from '../../constants/theme';
import { probe } from '../../core/http';
import { useLibrary } from '../../hooks/useLibrary';

type EndpointKind = 'invidious' | 'piped' | 'custom';

const KINDS: EndpointKind[] = ['invidious', 'piped', 'custom'];

/**
 * Playback source settings, opened from the existing output-device button.
 *
 * Discovery (search, playlists, metadata) works out of the box. Actually
 * streaming audio goes through whichever authorized endpoint the user points
 * NØTE at -- their own, or one they are permitted to use -- which is why this
 * is configured here rather than shipped with a hard-coded server.
 */
export const PlaybackSourceSheet: React.FC<{ visible: boolean; onClose: () => void }> = ({
  visible,
  onClose,
}) => {
  const { settings, updateSettings } = useLibrary();

  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<EndpointKind>('invidious');
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const endpoints = settings.resolverEndpoints;

  const add = async () => {
    const trimmed = url.trim().replace(/\/+$/, '');
    if (!trimmed) return;

    if (!/^https?:\/\//.test(trimmed)) {
      setStatus('Enter a full URL starting with https://');
      return;
    }
    if (endpoints.some((e) => e.url === trimmed)) {
      setStatus('That source is already added.');
      return;
    }

    setChecking(true);
    setStatus(null);

    // Probe with a known video id so an unreachable host is caught here
    // rather than in the middle of playback.
    const testPath =
      kind === 'invidious'
        ? '/api/v1/videos/dQw4w9WgXcQ'
        : kind === 'piped'
          ? '/streams/dQw4w9WgXcQ'
          : '';

    const reachable = await probe(`${trimmed}${testPath}`);
    setChecking(false);

    updateSettings({ resolverEndpoints: [...endpoints, { url: trimmed, kind }] });
    setUrl('');
    setStatus(
      reachable
        ? 'Added and reachable.'
        : "Added, but it didn't respond. Playback may fail."
    );
  };

  const remove = (target: string) => {
    updateSettings({
      resolverEndpoints: endpoints.filter((e) => e.url !== target),
    });
    setStatus(null);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />

        <BlurView intensity={40} tint="dark" style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Playback source</Text>
            <TouchableOpacity onPress={onClose}>
              <X color={COLORS.text.secondary} size={20} />
            </TouchableOpacity>
          </View>

          <Text style={styles.explainer}>
            Search and playlists work already. To stream audio, point NØTE at a
            playback service you're authorized to use.
          </Text>

          <View style={styles.kindRow}>
            {KINDS.map((k) => (
              <TouchableOpacity
                key={k}
                style={[styles.kindChip, kind === k && styles.kindChipActive]}
                onPress={() => setKind(k)}
              >
                <Text style={[styles.kindText, kind === k && styles.kindTextActive]}>{k}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="https://your-instance.example"
              placeholderTextColor={COLORS.text.muted}
              value={url}
              onChangeText={setUrl}
              onSubmitEditing={add}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TouchableOpacity style={styles.addButton} onPress={add} disabled={checking}>
              {checking ? (
                <ActivityIndicator size="small" color={COLORS.background} />
              ) : (
                <Check color={COLORS.background} size={18} />
              )}
            </TouchableOpacity>
          </View>

          {status && <Text style={styles.status}>{status}</Text>}

          <ScrollView style={styles.list}>
            {endpoints.length === 0 ? (
              <Text style={styles.empty}>No playback source configured yet.</Text>
            ) : (
              endpoints.map((e) => (
                <View key={e.url} style={styles.row}>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowUrl} numberOfLines={1}>{e.url}</Text>
                    <Text style={styles.rowKind}>{e.kind}</Text>
                  </View>
                  <TouchableOpacity onPress={() => remove(e.url)}>
                    <Trash2 color={COLORS.text.muted} size={18} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        </BlurView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: SIZES.radius.lg,
    borderTopRightRadius: SIZES.radius.lg,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    padding: SIZES.lg,
    paddingBottom: SIZES.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.sm,
  },
  title: {
    fontFamily: FONTS.medium,
    fontSize: 18,
    color: COLORS.text.primary,
  },
  explainer: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.text.secondary,
    marginBottom: SIZES.md,
  },
  kindRow: {
    flexDirection: 'row',
    marginBottom: SIZES.sm,
  },
  kindChip: {
    paddingHorizontal: SIZES.md,
    paddingVertical: 6,
    borderRadius: SIZES.radius.pill,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    marginRight: SIZES.sm,
  },
  kindChipActive: {
    backgroundColor: COLORS.text.primary,
    borderColor: COLORS.text.primary,
  },
  kindText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
  },
  kindTextActive: {
    color: COLORS.background,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 44,
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.primary,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: SIZES.radius.sm,
    paddingHorizontal: SIZES.sm,
  },
  addButton: {
    marginLeft: SIZES.sm,
    width: 44,
    height: 44,
    borderRadius: SIZES.radius.sm,
    backgroundColor: COLORS.text.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: SIZES.sm,
  },
  list: {
    marginTop: SIZES.md,
    maxHeight: 160,
  },
  empty: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.text.muted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SIZES.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
  },
  rowInfo: {
    flex: 1,
    paddingRight: SIZES.sm,
  },
  rowUrl: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.text.primary,
  },
  rowKind: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.text.muted,
    marginTop: 2,
  },
});
