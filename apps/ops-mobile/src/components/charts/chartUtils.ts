import { formatDateKey } from '../../utils/format';

export type SeriesPoint = { day: string; value: number };

export function fillDailySeries(rows: SeriesPoint[], days = 30): SeriesPoint[] {
  const map = new Map(rows.map((row) => [row.day, row.value]));
  const end = new Date();
  const out: SeriesPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(end);
    date.setDate(end.getDate() - i);
    const key = formatDateKey(date);
    out.push({ day: key, value: map.get(key) ?? 0 });
  }
  return out;
}

export function formatAxisValue(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (abs >= 10) return String(Math.round(value));
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function shortDayLabel(day: string): string {
  if (day.length >= 10) return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
  return day;
}

export function friendlyDayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return shortDayLabel(day);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function polar(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

export function donutSlicePath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  startAngle: number,
  endAngle: number,
): string {
  const sweep = Math.max(0, Math.min(359.999, endAngle - startAngle));
  if (sweep <= 0) return '';
  const large = sweep > 180 ? 1 : 0;
  const startOuter = polar(cx, cy, outer, startAngle);
  const endOuter = polar(cx, cy, outer, startAngle + sweep);
  const startInner = polar(cx, cy, inner, startAngle + sweep);
  const endInner = polar(cx, cy, inner, startAngle);
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outer} ${outer} 0 ${large} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${inner} ${inner} 0 ${large} 0 ${endInner.x} ${endInner.y}`,
    'Z',
  ].join(' ');
}

export function linePath(points: Array<{ x: number; y: number }>, closeY?: number): string {
  if (!points.length) return '';
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  if (closeY == null) return line;
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${last.x} ${closeY} L ${first.x} ${closeY} Z`;
}
