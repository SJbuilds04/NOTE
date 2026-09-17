import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Heart, ListMusic, Plus, X } from 'lucide-react-native';
import { COLORS, SIZES, FONTS } from '../../constants/theme';
import { Track } from '../../core/types';
import { useLibrary } from '../../hooks/useLibrary';

type Props = {
  /** The track being filed. Null closes the sheet. */
  track: Track | null;
  onClose: () => void;
};

/**
 * "Add to playlist" for a single track.
 *
 * Deliberately a plain Modal rather than a new navigation route: it is opened
 * from track rows on several screens, and a route would force each of them to
 * know about it.
 */
export const AddToPlaylistSheet: React.FC<Props> = ({ track, onClose }) => {
  const insets = useSafeAreaInsets();
  const {
    playlists,
    addToPlaylist,
    removeFromPlaylist,
    createPlaylist,
    toggleLike,
    isLiked,
  } = useLibrary();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  /**
   * Keyboard height, applied as bottom inset on the sheet.
   *
   * KeyboardAvoidingView is unreliable inside a Modal on Android, so the sheet
   * is lifted explicitly by however much the keyboard actually covers.
   */
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setKeyboardHeight(e.endCoordinates.height)
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const liked = track ? isLiked(track.id) : false;

  /** Newest-first, matching how Library orders them. */
  const ordered = useMemo(
    () => [...playlists].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    [playlists]
  );

  const close = useCallback(() => {
    Keyboard.dismiss();
    setCreating(false);
    setNewName('');
    onClose();
  }, [onClose]);

  /** Tapping a playlist toggles membership: add if absent, remove if present. */
  const toggleIn = useCallback(
    (playlistId: string, alreadyIn: boolean) => {
      if (!track) return;
      if (alreadyIn) removeFromPlaylist(playlistId, track.id);
      else addToPlaylist(playlistId, track);
    },
    [track, addToPlaylist, removeFromPlaylist]
  );

  const createAndAdd = useCallback(() => {
    const name = newName.trim();
    if (!name || !track) return;

    // Create it already containing the track, so this is one step not two.
    createPlaylist(name, [track]);
    Keyboard.dismiss();
    setNewName('');
    setCreating(false);
    close();
  }, [newName, track, createPlaylist, close]);

  return (
    <Modal
      visible={track !== null}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={close} />

      <View
        style={[
          styles.sheet,
          {
            paddingBottom:
              keyboardHeight > 0 ? SIZES.lg : insets.bottom + SIZES.lg,
            bottom: keyboardHeight,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Add to playlist</Text>
            {!!track && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {track.title}
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={close} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <X color={COLORS.text.secondary} size={22} />
          </TouchableOpacity>
        </View>

        {creating ? (
          <View style={styles.createRow}>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="Playlist name"
              placeholderTextColor={COLORS.text.muted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={createAndAdd}
              maxLength={60}
            />
            <TouchableOpacity
              style={[styles.createButton, !newName.trim() && styles.disabled]}
              onPress={createAndAdd}
              disabled={!newName.trim()}
            >
              <Text style={styles.createButtonText}>Create</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => setCreating(true)}
          >
            <View style={styles.rowIcon}>
              <Plus color={COLORS.text.primary} size={20} />
            </View>
            <Text style={styles.rowLabel}>New playlist</Text>
          </TouchableOpacity>
        )}

        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {/* Liked Songs is synthetic, so it toggles the like instead. */}
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => track && toggleLike(track)}
          >
            <View style={styles.rowIcon}>
              <Heart
                color={liked ? COLORS.accent.green : COLORS.text.primary}
                fill={liked ? COLORS.accent.green : 'transparent'}
                size={20}
              />
            </View>
            <Text style={styles.rowLabel}>Liked Songs</Text>
            {liked && <Check color={COLORS.accent.green} size={18} />}
          </TouchableOpacity>

          {ordered.map((playlist) => {
            const alreadyIn = playlist.tracks.some((t) => t.id === track?.id);

            return (
              <TouchableOpacity
                key={playlist.id}
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => toggleIn(playlist.id, alreadyIn)}
              >
                <View style={styles.rowIcon}>
                  <ListMusic color={COLORS.text.primary} size={20} />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {playlist.name}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {playlist.tracks.length}{' '}
                    {playlist.tracks.length === 1 ? 'track' : 'tracks'}
                  </Text>
                </View>
                {alreadyIn && <Check color={COLORS.accent.green} size={18} />}
              </TouchableOpacity>
            );
          })}

          {ordered.length === 0 && !creating && (
            <Text style={styles.empty}>
              No playlists yet. Create one above.
            </Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    maxHeight: '75%',
    backgroundColor: COLORS.surfaceRaised,
    borderTopLeftRadius: SIZES.radius.lg,
    borderTopRightRadius: SIZES.radius.lg,
    borderTopWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingTop: SIZES.lg,
    paddingHorizontal: SIZES.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: SIZES.md,
  },
  headerText: {
    flex: 1,
    marginRight: SIZES.md,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: COLORS.text.primary,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SIZES.sm + 4,
    gap: SIZES.md,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: SIZES.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceLight,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowLabel: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.primary,
  },
  rowMeta: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    marginBottom: SIZES.sm,
  },
  input: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.primary,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: SIZES.radius.sm,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm + 4,
  },
  createButton: {
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm + 4,
    borderRadius: SIZES.radius.sm,
    backgroundColor: COLORS.text.primary,
  },
  createButtonText: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.background,
  },
  disabled: {
    opacity: 0.4,
  },
  empty: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.secondary,
    paddingVertical: SIZES.lg,
  },
});
