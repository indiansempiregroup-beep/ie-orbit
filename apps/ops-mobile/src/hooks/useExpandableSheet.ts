import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSheetKeyboardLayout } from './useSheetKeyboardLayout';

const EXPANDED_TOP_GAP = 12;
/** Shortest height: header, a little of the body, and the bottom actions. */
const COMPACT_FRACTION = 0.36;
const COMPACT_MIN = 260;

/** Fills the space above a pinned footer once the sheet has an explicit height. */
export const sheetBodyStyle = {
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: 0,
} as const;

export const ExpandableSheetView = Animated.View;

type Options = {
  /** Picker sheets that already open at a fixed height. */
  fixedResting?: boolean;
};

/**
 * Bottom sheets open at their content height.
 * Dragging the grabber leaves the sheet at the height where the finger lets go.
 * The footer stays pinned to the bottom of the sheet.
 */
export function useExpandableSheet(
  restingFraction = 0.88,
  resetKey?: unknown,
  options?: Options,
) {
  const fixedResting = options?.fixedResting ?? false;
  const layout = useSheetKeyboardLayout(restingFraction);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const [driven, setDriven] = useState(fixedResting);
  const expandedRef = useRef(false);
  const drivenRef = useRef(fixedResting);
  const dragRef = useRef(false);
  const restingRef = useRef(layout.maxHeight);
  const capRef = useRef(layout.maxHeight);
  const dragOrigin = useRef(layout.maxHeight);
  const heightAnim = useRef(new Animated.Value(layout.maxHeight)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const expandedHeight = Math.max(
    layout.maxHeight,
    Math.round(windowHeight - Math.max(insets.top, 0) - EXPANDED_TOP_GAP - layout.lift),
  );
  const expandedHeightRef = useRef(expandedHeight);
  const windowHeightRef = useRef(windowHeight);
  const settledRef = useRef(layout.maxHeight);
  expandedHeightRef.current = expandedHeight;
  windowHeightRef.current = windowHeight;
  capRef.current = layout.maxHeight;

  const restingHeight = useCallback(
    () => Math.max(160, restingRef.current || capRef.current),
    [],
  );

  const compactHeight = useCallback(() => {
    const preferred = Math.max(COMPACT_MIN, Math.round(windowHeightRef.current * COMPACT_FRACTION));
    return Math.min(restingHeight(), preferred);
  }, [restingHeight]);

  const stops = useCallback(() => {
    const points = [compactHeight(), restingHeight(), expandedHeightRef.current];
    return points
      .filter((value, index) => points.findIndex((other) => Math.abs(other - value) < 24) === index)
      .sort((a, b) => a - b);
  }, [compactHeight, restingHeight]);

  useEffect(() => {
    animRef.current?.stop();
    dragRef.current = false;
    expandedRef.current = false;
    setExpanded(false);
    if (fixedResting) {
      restingRef.current = capRef.current;
      settledRef.current = capRef.current;
      heightAnim.setValue(capRef.current);
      drivenRef.current = true;
      setDriven(true);
      return;
    }
    drivenRef.current = false;
    setDriven(false);
  }, [resetKey, fixedResting, heightAnim]);

  useEffect(() => {
    if (!fixedResting) return;
    const previous = restingRef.current;
    restingRef.current = layout.maxHeight;
    if (
      !dragRef.current &&
      !expandedRef.current &&
      Math.abs(settledRef.current - previous) < 8
    ) {
      settledRef.current = layout.maxHeight;
      heightAnim.setValue(layout.maxHeight);
    }
  }, [fixedResting, layout.maxHeight, heightAnim]);

  useEffect(() => {
    if (expandedRef.current && !dragRef.current) heightAnim.setValue(expandedHeight);
  }, [expandedHeight, heightAnim]);

  useEffect(() => () => animRef.current?.stop(), []);

  const onSheetLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (fixedResting || drivenRef.current || dragRef.current) return;
      const next = event.nativeEvent.layout.height;
      if (next > 0) {
        restingRef.current = next;
        settledRef.current = next;
      }
    },
    [fixedResting],
  );

  const finishAt = useCallback(
    (target: number, nextExpanded: boolean) => {
      animRef.current?.stop();
      settledRef.current = target;
      expandedRef.current = nextExpanded;
      setExpanded(nextExpanded);
      drivenRef.current = true;
      setDriven(true);
      animRef.current = Animated.timing(heightAnim, {
        toValue: target,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      });
      animRef.current.start(({ finished }) => {
        if (!finished) return;
        dragRef.current = false;
        const backToOpenHeight = Math.abs(target - restingHeight()) < 8;
        if (backToOpenHeight && !fixedResting) {
          drivenRef.current = false;
          setDriven(false);
        }
      });
    },
    [fixedResting, heightAnim, restingHeight],
  );

  const onDragStart = useCallback(() => {
    animRef.current?.stop();
    dragRef.current = true;
    const origin = drivenRef.current ? settledRef.current : restingHeight();
    dragOrigin.current = origin;
    heightAnim.setValue(origin);
    drivenRef.current = true;
    setDriven(true);
  }, [heightAnim, restingHeight]);

  const onDragMove = useCallback(
    (dy: number) => {
      const points = stops();
      const low = points[0];
      const high = points[points.length - 1];
      const next = dragOrigin.current - dy;
      heightAnim.setValue(Math.min(high, Math.max(low, next)));
    },
    [heightAnim, stops],
  );

  const onDragEnd = useCallback(
    (dy: number) => {
      const points = stops();
      const low = points[0];
      const high = points[points.length - 1];
      const current = Math.min(high, Math.max(low, dragOrigin.current - dy));
      dragRef.current = false;
      settledRef.current = current;
      heightAnim.setValue(current);
      const atTop = Math.abs(current - high) < 8;
      expandedRef.current = atTop;
      setExpanded(atTop);
      drivenRef.current = true;
      setDriven(true);
    },
    [heightAnim, stops],
  );

  const toggle = useCallback(() => {
    const nextExpanded = !expandedRef.current;
    const openHeight = restingHeight();
    const high = expandedHeightRef.current;
    if (nextExpanded) heightAnim.setValue(drivenRef.current ? settledRef.current : openHeight);
    finishAt(nextExpanded ? high : openHeight, nextExpanded);
  }, [finishAt, heightAnim, restingHeight]);

  const sheetMotionStyle = useMemo(() => {
    if (fixedResting || driven) {
      return {
        height: heightAnim,
        maxHeight: expandedHeight,
        overflow: 'hidden',
      } as Animated.WithAnimatedObject<ViewStyle>;
    }
    return { maxHeight: layout.maxHeight } as Animated.WithAnimatedObject<ViewStyle>;
  }, [fixedResting, driven, heightAnim, expandedHeight, layout.maxHeight]);

  return {
    ...layout,
    expanded,
    expandedHeight,
    driven,
    onSheetLayout,
    sheetMotionStyle,
    handleProps: {
      expanded,
      onToggle: toggle,
      onDragStart,
      onDragMove,
      onDragEnd,
    },
  };
}
