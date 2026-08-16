import React from 'react';
import { Linking, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';

type Node =
  | { type: 'text'; value: string }
  | { type: 'tag'; name: string; href?: string; children: Node[] };

const BLOCK_TAGS = new Set(['p', 'div', 'h2', 'h3', 'h4', 'ul', 'ol', 'li']);

function parseHtml(html: string): Node[] {
  const tokens = html.split(/(<\/?[^>]+>)/g).filter(Boolean);
  const root: Node[] = [];
  const stack: Array<{ name: string; href?: string; children: Node[] }> = [];

  const current = () => (stack.length ? stack[stack.length - 1].children : root);

  for (const token of tokens) {
    const open = /^<([a-zA-Z0-9]+)([^>]*)\/?>$/.exec(token);
    const close = /^<\/([a-zA-Z0-9]+)>$/.exec(token);
    if (open) {
      const name = open[1].toLowerCase();
      if (name === 'br') {
        current().push({ type: 'text', value: '\n' });
        continue;
      }
      const hrefMatch = /href=["']([^"']+)["']/i.exec(open[2] || '');
      const node = { name, href: hrefMatch?.[1], children: [] as Node[] };
      if (token.endsWith('/>')) {
        current().push({ type: 'tag', ...node });
      } else {
        stack.push(node);
      }
      continue;
    }
    if (close) {
      const name = close[1].toLowerCase();
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].name === name) {
          const node = stack.pop()!;
          while (stack.length > i) stack.pop();
          current().push({ type: 'tag', name: node.name, href: node.href, children: node.children });
          break;
        }
      }
      continue;
    }
    current().push({ type: 'text', value: decodeEntities(token) });
  }
  while (stack.length) {
    const node = stack.pop()!;
    current().push({ type: 'tag', name: node.name, href: node.href, children: node.children });
  }
  return root;
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function renderNodes(nodes: Node[], keyPrefix: string): React.ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === 'text') {
      return (
        <Text key={key} style={inline ? undefined : styles.body}>
          {node.value}
        </Text>
      );
    }
        const children = renderNodes(node.children, key);
    if (node.name === 'strong' || node.name === 'b') {
      return (
        <Text key={key} style={styles.bold}>
          {children}
        </Text>
      );
    }
    if (node.name === 'em' || node.name === 'i') {
      return (
        <Text key={key} style={styles.italic}>
          {children}
        </Text>
      );
    }
    if (node.name === 'u') {
      return (
        <Text key={key} style={styles.underline}>
          {children}
        </Text>
      );
    }
    if (node.name === 'a' && node.href) {
      return (
        <Text key={key} style={styles.link} onPress={() => void Linking.openURL(node.href!)}>
          {children}
        </Text>
      );
    }
    if (node.name === 'h2' || node.name === 'h3' || node.name === 'h4') {
      return (
        <Text key={key} style={styles.heading}>
          {children}
        </Text>
      );
    }
    if (node.name === 'li') {
      return (
        <Text key={key} style={styles.listItem}>
          {'• '}
          {children}
        </Text>
      );
    }
    if (BLOCK_TAGS.has(node.name)) {
      return (
        <Text key={key} style={styles.body}>
          {children}
          {'\n'}
        </Text>
      );
    }
    return (
      <Text key={key} style={styles.body}>
        {children}
      </Text>
    );
  });
}

type Props = {
  html?: string | null;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function HtmlContent({ html, style }: Props) {
  const value = (html || '').trim();
  if (!value) return null;
  return <View style={[styles.wrap, style]}>{renderNodes(parseHtml(value), 'html')}</View>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  body: { ...typography.body, color: colors.foreground, lineHeight: 22 },
  heading: { ...typography.title, color: colors.foreground, marginTop: spacing.sm, marginBottom: 4 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  underline: { textDecorationLine: 'underline' },
  link: { color: colors.primary, fontWeight: '600' },
  listItem: { ...typography.body, color: colors.foreground, lineHeight: 22, marginLeft: 4 },
});
