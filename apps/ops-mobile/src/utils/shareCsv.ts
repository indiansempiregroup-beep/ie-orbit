import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

function csvEscape(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

export async function shareCsv(filename: string, csv: string): Promise<void> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('File sharing is not available on this device');
  }
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true, intermediates: true });
  file.write(csv);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Export CSV',
  });
}
