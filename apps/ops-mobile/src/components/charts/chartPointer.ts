export function locationFromEvent(event: {
  nativeEvent: { locationX?: number; locationY?: number; offsetX?: number; offsetY?: number };
}) {
  const native = event.nativeEvent;
  return {
    x: Number(native.locationX ?? native.offsetX ?? 0),
    y: Number(native.locationY ?? native.offsetY ?? 0),
  };
}

export function chartPointerProps(onMove: (x: number, y: number) => void, onLeave: () => void) {
  const handle = (event: { nativeEvent: { locationX?: number; locationY?: number; offsetX?: number; offsetY?: number } }) => {
    const point = locationFromEvent(event);
    onMove(point.x, point.y);
  };
  return {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: handle,
    onResponderMove: handle,
    onResponderRelease: onLeave,
    onResponderTerminate: onLeave,
    onMouseMove: handle,
    onMouseLeave: onLeave,
  };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
