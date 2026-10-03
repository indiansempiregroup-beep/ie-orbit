import { Feather } from '@expo/vector-icons';
import type { IconTone } from './tokens';

type IconName = keyof typeof Feather.glyphMap;

/** Icon → tone map shared by More menu rows and desktop sidebar. */
export const menuIconTones: Partial<Record<IconName, IconTone>> = {
  home: 'amber',
  calendar: 'blue',
  'book-open': 'violet',
  book: 'violet',
  layers: 'violet',
  'shopping-cart': 'green',
  'shopping-bag': 'green',
  package: 'amber',
  truck: 'coral',
  users: 'cyan',
  user: 'cyan',
  'user-check': 'green',
  heart: 'rose',
  star: 'amber',
  bell: 'coral',
  'bar-chart-2': 'violet',
  'map-pin': 'coral',
  'message-circle': 'green',
  globe: 'blue',
  'share-2': 'cyan',
  tool: 'amber',
  image: 'rose',
  tag: 'coral',
  'credit-card': 'violet',
  'dollar-sign': 'green',
  file: 'blue',
  'file-text': 'blue',
  clipboard: 'violet',
  award: 'amber',
  percent: 'green',
  'rotate-ccw': 'coral',
  list: 'blue',
  settings: 'navy',
  shield: 'navy',
  gift: 'rose',
  'life-buoy': 'coral',
  'log-out': 'rose',
  // Primary button CTAs (same badge language as nav)
  plus: 'green',
  check: 'green',
  'check-circle': 'green',
  'arrow-right': 'blue',
  'edit-2': 'violet',
  'edit-3': 'violet',
  send: 'cyan',
  'log-in': 'blue',
  mail: 'cyan',
  eye: 'blue',
  play: 'green',
  link: 'cyan',
  slash: 'rose',
  'refresh-cw': 'coral',
  sliders: 'navy',
  repeat: 'violet',
  layout: 'blue',
  grid: 'violet',
  copy: 'cyan',
  download: 'blue',
  maximize: 'navy',
};

export function toneForMenuIcon(icon: IconName, destructive?: boolean): IconTone {
  if (destructive) return 'rose';
  return menuIconTones[icon] ?? 'blue';
}
