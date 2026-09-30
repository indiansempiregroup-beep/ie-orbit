import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImageManipulator from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../../theme/tokens';

export type ProductImageCropResult = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type Props = {
  uri: string | null;
  visible: boolean;
  onCancel: () => void;
  onConfirm: (cropped: ImagePickerAsset, options?: { removeBackground: boolean }) => void;
  canRemoveBackground?: boolean;
};

const MIN = 0.05;
const HIT_PX = 44;

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
type Rect = ProductImageCropResult;

function clampRect(next: Rect): Rect {
  let { left, top, width, height } = next;
  width = Math.min(Math.max(MIN, width), 1);
  height = Math.min(Math.max(MIN, height), 1);
  left = Math.min(Math.max(0, left), 1 - width);
  top = Math.min(Math.max(0, top), 1 - height);
  return { left, top, width, height };
}

function applyHandle(start: Rect, handle: Handle, dx: number, dy: number): Rect {
  if (handle === 'move') {
    return clampRect({ ...start, left: start.left + dx, top: start.top + dy });
  }
  const right = start.left + start.width;
  const bottom = start.top + start.height;
  let left = start.left;
  let top = start.top;
  let r = right;
  let b = bottom;

  if (handle === 'nw' || handle === 'w' || handle === 'sw') left = start.left + dx;
  if (handle === 'ne' || handle === 'e' || handle === 'se') r = right + dx;
  if (handle === 'nw' || handle === 'n' || handle === 'ne') top = start.top + dy;
  if (handle === 'sw' || handle === 's' || handle === 'se') b = bottom + dy;

  if (r < left + MIN) {
    if (handle.includes('w')) left = r - MIN;
    else r = left + MIN;
  }
  if (b < top + MIN) {
    if (handle.includes('n')) top = b - MIN;
    else b = top + MIN;
  }
  return clampRect({ left, top, width: r - left, height: b - top });
}

function hitTest(
  x: number,
  y: number,
  box: { left: number; top: number; width: number; height: number },
): Handle | null {
  const { left, top, width, height } = box;
  const right = left + width;
  const bottom = top + height;
  const near = (px: number, py: number) => Math.hypot(x - px, y - py) <= HIT_PX;

  if (near(left, top)) return 'nw';
  if (near(right, top)) return 'ne';
  if (near(left, bottom)) return 'sw';
  if (near(right, bottom)) return 'se';

  const onTop = Math.abs(y - top) <= HIT_PX / 2 && x >= left && x <= right;
  const onBottom = Math.abs(y - bottom) <= HIT_PX / 2 && x >= left && x <= right;
  const onLeft = Math.abs(x - left) <= HIT_PX / 2 && y >= top && y <= bottom;
  const onRight = Math.abs(x - right) <= HIT_PX / 2 && y >= top && y <= bottom;
  if (onTop) return 'n';
  if (onBottom) return 's';
  if (onLeft) return 'w';
  if (onRight) return 'e';

  if (x >= left && x <= right && y >= top && y <= bottom) return 'move';
  return null;
}

/**
 * Scanner-style crop. Flex layout keeps Cancel / Use crop above the home indicator.
 */
export function ProductImageCropModal({
  uri,
  visible,
  onCancel,
  onConfirm,
  canRemoveBackground = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const [stageSize, setStageSize] = useState({ w: screenW, h: 320 });

  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const [crop, setCrop] = useState<Rect>({ left: 0.12, top: 0.1, width: 0.76, height: 0.8 });
  const [removeBackground, setRemoveBackground] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeHandle, setActiveHandle] = useState<Handle | null>(null);

  const cropRef = useRef(crop);
  cropRef.current = crop;
  const imageBoxRef = useRef({ x: 0, y: 0, width: 1, height: 1 });
  const drag = useRef<{ handle: Handle; start: Rect } | null>(null);

  useEffect(() => {
    if (!visible || !uri) return;
    setCrop({ left: 0.12, top: 0.1, width: 0.76, height: 0.8 });
    setRemoveBackground(false);
    setBusy(false);
    setError(null);
    setActiveHandle(null);
    Image.getSize(
      uri,
      (w, h) => setNatural({ w: Math.max(1, w), h: Math.max(1, h) }),
      () => setNatural({ w: 1, h: 1 }),
    );
  }, [visible, uri]);

  const stageW = Math.max(1, stageSize.w);
  const stageH = Math.max(1, stageSize.h);

  const imageBox = useMemo(() => {
    const ratio = natural.w / natural.h;
    const stageRatio = stageW / stageH;
    if (ratio > stageRatio) {
      const width = stageW;
      const height = stageW / ratio;
      return { x: 0, y: (stageH - height) / 2, width, height };
    }
    const height = stageH;
    const width = stageH * ratio;
    return { x: (stageW - width) / 2, y: 0, width, height };
  }, [natural.h, natural.w, stageH, stageW]);
  imageBoxRef.current = imageBox;

  const boxPx = useMemo(
    () => ({
      left: imageBox.x + crop.left * imageBox.width,
      top: imageBox.y + crop.top * imageBox.height,
      width: crop.width * imageBox.width,
      height: crop.height * imageBox.height,
    }),
    [crop, imageBox],
  );

  const gesture = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          const handle = hitTest(locationX, locationY, {
            left: imageBoxRef.current.x + cropRef.current.left * imageBoxRef.current.width,
            top: imageBoxRef.current.y + cropRef.current.top * imageBoxRef.current.height,
            width: cropRef.current.width * imageBoxRef.current.width,
            height: cropRef.current.height * imageBoxRef.current.height,
          });
          if (!handle) {
            drag.current = null;
            setActiveHandle(null);
            return;
          }
          drag.current = { handle, start: { ...cropRef.current } };
          setActiveHandle(handle);
        },
        onPanResponderMove: (_evt, gestureState) => {
          if (!drag.current) return;
          const ib = imageBoxRef.current;
          if (ib.width < 1 || ib.height < 1) return;
          const dx = gestureState.dx / ib.width;
          const dy = gestureState.dy / ib.height;
          setCrop(applyHandle(drag.current.start, drag.current.handle, dx, dy));
        },
        onPanResponderRelease: () => {
          drag.current = null;
          setActiveHandle(null);
        },
        onPanResponderTerminate: () => {
          drag.current = null;
          setActiveHandle(null);
        },
      }),
    [],
  );

  async function handleUse() {
    if (!uri) return;
    setBusy(true);
    setError(null);
    try {
      const originX = Math.max(0, Math.round(crop.left * natural.w));
      const originY = Math.max(0, Math.round(crop.top * natural.h));
      let width = Math.round(crop.width * natural.w);
      let height = Math.round(crop.height * natural.h);
      width = Math.max(1, Math.min(width, natural.w - originX));
      height = Math.max(1, Math.min(height, natural.h - originY));

      const actions: ImageManipulator.Action[] = [{ crop: { originX, originY, width, height } }];
      // Keep uploads lean so rembg does not hang/drop the request on phone photos.
      const maxEdge = 1600;
      if (width > maxEdge || height > maxEdge) {
        const scale = maxEdge / Math.max(width, height);
        actions.push({
          resize: {
            width: Math.max(1, Math.round(width * scale)),
            height: Math.max(1, Math.round(height * scale)),
          },
        });
      }

      const result = await ImageManipulator.manipulateAsync(uri, actions, {
        compress: 0.92,
        format: ImageManipulator.SaveFormat.PNG,
      });

      onConfirm(
        {
          uri: result.uri,
          width: result.width,
          height: result.height,
          mimeType: 'image/png',
          fileName: `product-crop-${Date.now()}.png`,
        },
        { removeBackground: canRemoveBackground && removeBackground },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to crop photo.');
    } finally {
      setBusy(false);
    }
  }

  const cornerStyle = (key: Handle, style: object) => [
    styles.corner,
    style,
    activeHandle === key && styles.cornerActive,
  ];

  return (
    <Modal
      visible={visible && Boolean(uri)}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
    >
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} hitSlop={12} disabled={busy} style={styles.headerBtn}>
            <Feather name="x" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Adjust edges</Text>
          <Pressable onPress={() => void handleUse()} hitSlop={12} disabled={busy} style={styles.headerBtn}>
            {busy ? <ActivityIndicator color="#fff" /> : <Feather name="check" size={22} color="#fff" />}
          </Pressable>
        </View>

        <View
          style={styles.stage}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            if (width > 0 && height > 0) {
              setStageSize({ w: width, h: height });
            }
          }}
          {...gesture.panHandlers}
        >
          {uri ? (
            <Image
              source={{ uri }}
              style={{
                position: 'absolute',
                left: imageBox.x,
                top: imageBox.y,
                width: imageBox.width,
                height: imageBox.height,
              }}
              resizeMode="stretch"
              pointerEvents="none"
            />
          ) : null}

          <View pointerEvents="none" style={[styles.dim, { top: 0, left: 0, right: 0, height: boxPx.top }]} />
          <View
            pointerEvents="none"
            style={[styles.dim, { top: boxPx.top + boxPx.height, left: 0, right: 0, bottom: 0 }]}
          />
          <View
            pointerEvents="none"
            style={[styles.dim, { top: boxPx.top, left: 0, width: boxPx.left, height: boxPx.height }]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.dim,
              { top: boxPx.top, left: boxPx.left + boxPx.width, right: 0, height: boxPx.height },
            ]}
          />

          <View
            pointerEvents="none"
            style={[
              styles.selection,
              {
                left: boxPx.left,
                top: boxPx.top,
                width: boxPx.width,
                height: boxPx.height,
              },
            ]}
          >
            <View style={[styles.gridLine, styles.gridV, { left: '33.33%' }]} />
            <View style={[styles.gridLine, styles.gridV, { left: '66.66%' }]} />
            <View style={[styles.gridLine, styles.gridH, { top: '33.33%' }]} />
            <View style={[styles.gridLine, styles.gridH, { top: '66.66%' }]} />

            <View style={cornerStyle('nw', styles.nw)} />
            <View style={cornerStyle('ne', styles.ne)} />
            <View style={cornerStyle('sw', styles.sw)} />
            <View style={cornerStyle('se', styles.se)} />
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerHint}>
            Pull any white corner to resize. Drag inside to move.
          </Text>
          {canRemoveBackground ? (
            <Pressable
              style={styles.toggleRow}
              onPress={() => setRemoveBackground((value) => !value)}
              disabled={busy}
            >
              <Feather
                name={removeBackground ? 'check-square' : 'square'}
                size={20}
                color={removeBackground ? colors.primary : '#94a3b8'}
              />
              <Text style={styles.toggleLabel}>Remove background</Text>
            </Pressable>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.footerActions}>
            <Pressable style={styles.footerBtn} onPress={onCancel} disabled={busy}>
              <Text style={styles.footerBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.footerBtn, styles.footerBtnPrimary]}
              onPress={() => void handleUse()}
              disabled={busy}
            >
              <Text style={[styles.footerBtnText, styles.footerBtnPrimaryText]}>
                {busy ? 'Cropping…' : 'Use crop'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const CORNER = 30;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0f14' },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    flexShrink: 0,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 16, fontFamily: fonts.bodySemi, fontWeight: '600' },
  stage: { flex: 1, minHeight: 160, backgroundColor: '#000', position: 'relative' },
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  selection: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#fff',
  },
  gridLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.35)' },
  gridV: { top: 0, bottom: 0, width: StyleSheet.hairlineWidth },
  gridH: { left: 0, right: 0, height: StyleSheet.hairlineWidth },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderRadius: CORNER / 2,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: colors.primary,
  },
  cornerActive: {
    transform: [{ scale: 1.15 }],
    borderColor: '#38bdf8',
  },
  nw: { left: -CORNER / 2, top: -CORNER / 2 },
  ne: { right: -CORNER / 2, top: -CORNER / 2 },
  sw: { left: -CORNER / 2, bottom: -CORNER / 2 },
  se: { right: -CORNER / 2, bottom: -CORNER / 2 },
  footer: {
    flexShrink: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  footerHint: { color: 'rgba(255,255,255,0.75)', fontSize: 12, textAlign: 'center' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  toggleLabel: { color: '#e2e8f0', fontSize: 14, fontFamily: fonts.body },
  error: { color: '#fca5a5', textAlign: 'center', fontSize: 13 },
  footerActions: { flexDirection: 'row', gap: spacing.sm },
  footerBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  footerBtnPrimary: { backgroundColor: colors.primary },
  footerBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  footerBtnPrimaryText: { color: colors.primaryForeground },
});
