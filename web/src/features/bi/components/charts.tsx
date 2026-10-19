import React, { useId, useMemo, useState } from 'react';

export type ChartSlice = { label: string; value: number; color: string };
export type ChartPoint = { label: string; value: number };
export type ChartBar = { label: string; value: number; color?: string };

const MUTED = 'var(--muted-foreground)';

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutPath(cx: number, cy: number, outer: number, inner: number, start: number, end: number) {
  const sweep = Math.max(0.001, Math.min(359.999, end - start));
  const large = sweep > 180 ? 1 : 0;
  const o1 = polar(cx, cy, outer, start);
  const o2 = polar(cx, cy, outer, start + sweep);
  const i1 = polar(cx, cy, inner, start + sweep);
  const i2 = polar(cx, cy, inner, start);
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${outer} ${outer} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${inner} ${inner} 0 ${large} 0 ${i2.x} ${i2.y}`,
    'Z',
  ].join(' ');
}

export function DonutPieChart({
  data,
  size = 180,
  centerLabel = 'total',
  formatValue = (v: number) => String(Math.round(v)),
}: {
  data: ChartSlice[];
  size?: number;
  centerLabel?: string;
  formatValue?: (value: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const total = data.reduce((sum, row) => sum + Math.max(0, row.value), 0);
  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 6;
  const inner = outer * 0.58;

  const slices = useMemo(() => {
    if (total <= 0) {
      return [
        {
          ...data[0],
          label: 'None',
          value: 0,
          color: '#cbd5e1',
          path: donutPath(cx, cy, outer, inner, 0, 359.999),
        },
      ];
    }
    let angle = 0;
    return data
      .filter((row) => row.value > 0)
      .map((row) => {
        const sweep = (row.value / total) * 360;
        const path = donutPath(cx, cy, outer, inner, angle, angle + sweep);
        angle += sweep;
        return { ...row, path };
      });
  }, [cx, cy, data, inner, outer, total]);

  const selected = active != null ? slices[active] : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {slices.map((slice, index) => (
            <path
              key={`${slice.label}-${index}`}
              d={slice.path}
              fill={slice.color}
              opacity={active == null || active === index ? 1 : 0.28}
              style={{ cursor: 'pointer', transition: 'opacity 120ms ease' }}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeContent: 'center',
            textAlign: 'center',
            pointerEvents: 'none',
            padding: 12,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 750, letterSpacing: '-0.02em' }}>
            {formatValue(selected ? selected.value : total)}
          </div>
          <div style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {selected ? selected.label : centerLabel}
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
        {slices.map((slice, index) => {
          const share = total > 0 ? Math.round((slice.value / total) * 100) : 0;
          return (
            <button
              key={`${slice.label}-${index}`}
              type="button"
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                border: 'none',
                background: active === index ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'transparent',
                borderRadius: 8,
                padding: '6px 8px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 999, background: slice.color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {slice.label}
              </span>
              <span style={{ fontSize: 12, color: MUTED }}>{share}%</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{formatValue(slice.value)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LineAreaChart({
  data,
  height = 220,
  color = '#0f766e',
  formatValue = (v: number) => String(Math.round(v)),
  formatLabel = (label: string) => label,
}: {
  data: ChartPoint[];
  height?: number;
  color?: string;
  formatValue?: (value: number) => string;
  formatLabel?: (label: string) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const gradientId = useId().replace(/:/g, '');
  const width = 640;
  const pad = { top: 20, right: 16, bottom: 28, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(...data.map((row) => row.value), 1);
  const min = Math.min(0, ...data.map((row) => row.value));
  const span = Math.max(max - min, 1);

  const points = data.map((row, index) => {
    const x = pad.left + (data.length <= 1 ? innerW / 2 : (index / (data.length - 1)) * innerW);
    const y = pad.top + innerH - ((row.value - min) / span) * innerH;
    return { ...row, x, y };
  });

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const area =
    points.length > 1
      ? `${line} L ${points[points.length - 1].x} ${pad.top + innerH} L ${points[0].x} ${pad.top + innerH} Z`
      : '';

  const selected = points[active ?? Math.max(0, points.length - 1)];
  const xLabels =
    data.length <= 3
      ? data
      : [data[0], data[Math.floor(data.length / 2)], data[data.length - 1]];

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {selected ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
          <span style={{ color: MUTED }}>{formatLabel(selected.label)}</span>
          <strong>{formatValue(selected.value)}</strong>
        </div>
      ) : null}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        style={{ overflow: 'visible' }}
        onMouseLeave={() => setActive(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((ratio) => {
          const y = pad.top + innerH * (1 - ratio);
          return (
            <g key={ratio}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeDasharray="4 4"
              />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill={MUTED}>
                {formatValue(min + span * ratio)}
              </text>
            </g>
          );
        })}
        {area ? <path d={area} fill={`url(#${gradientId})`} /> : null}
        {points.length > 1 ? (
          <path d={line} fill="none" stroke={color} strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
        {points.map((point, index) => (
          <g key={point.label} onMouseEnter={() => setActive(index)} style={{ cursor: 'pointer' }}>
            <circle
              cx={point.x}
              cy={point.y}
              r={active === index ? 6 : 0}
              fill={color}
              stroke="#fff"
              strokeWidth="2"
            />
            <rect
              x={point.x - Math.max(8, innerW / Math.max(data.length, 1) / 2)}
              y={pad.top}
              width={Math.max(16, innerW / Math.max(data.length, 1))}
              height={innerH}
              fill="transparent"
            />
          </g>
        ))}
        {selected && active != null ? (
          <>
            <line
              x1={selected.x}
              x2={selected.x}
              y1={pad.top}
              y2={pad.top + innerH}
              stroke={color}
              strokeDasharray="4 4"
              strokeOpacity="0.45"
            />
            <circle cx={selected.x} cy={selected.y} r={5.5} fill={color} />
            <circle cx={selected.x} cy={selected.y} r={2.5} fill="#fff" />
          </>
        ) : selected ? (
          <circle cx={selected.x} cy={selected.y} r={4.5} fill={color} />
        ) : null}
        {xLabels.map((row) => {
          const index = data.findIndex((item) => item.label === row.label);
          const x =
            pad.left + (data.length <= 1 ? innerW / 2 : (index / Math.max(data.length - 1, 1)) * innerW);
          return (
            <text key={row.label} x={x} y={height - 8} textAnchor="middle" fontSize="11" fill={MUTED}>
              {formatLabel(row.label)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export function BarGraph({
  data,
  height = 200,
  color = '#1d4ed8',
  formatValue = (v: number) => String(Math.round(v)),
}: {
  data: ChartBar[];
  height?: number;
  color?: string;
  formatValue?: (value: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const width = 640;
  const pad = { top: 16, right: 12, bottom: 36, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(...data.map((row) => row.value), 1);
  const gap = 8;
  const barW = data.length ? Math.max(10, (innerW - gap * (data.length - 1)) / data.length) : 0;
  const selected = data[active ?? Math.max(0, data.length - 1)];

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {selected ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
          <span style={{ color: MUTED }}>{selected.label}</span>
          <strong>{formatValue(selected.value)}</strong>
        </div>
      ) : null}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        onMouseLeave={() => setActive(null)}
      >
        {[0, 0.5, 1].map((ratio) => {
          const y = pad.top + innerH * (1 - ratio);
          return (
            <g key={ratio}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeDasharray="4 4"
              />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill={MUTED}>
                {formatValue(max * ratio)}
              </text>
            </g>
          );
        })}
        {data.map((row, index) => {
          const h = Math.max(row.value > 0 ? 4 : 0, (row.value / max) * (innerH - 2));
          const x = pad.left + index * (barW + gap);
          const y = pad.top + innerH - h;
          const fill = row.color || color;
          const isActive = active == null || active === index;
          return (
            <g key={row.label} onMouseEnter={() => setActive(index)} style={{ cursor: 'pointer' }}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={Math.min(8, barW / 2)}
                fill={fill}
                opacity={isActive ? 1 : 0.28}
              />
              <text
                x={x + barW / 2}
                y={height - 10}
                textAnchor="middle"
                fontSize="11"
                fill={MUTED}
              >
                {row.label.length > 8 ? `${row.label.slice(0, 7)}…` : row.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export const CHART_PALETTE = ['#0f766e', '#1d4ed8', '#b45309', '#0369a1', '#15803d', '#a16207', '#be123c'];
