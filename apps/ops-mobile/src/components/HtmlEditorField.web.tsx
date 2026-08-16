import React, { createElement, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Props = {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
};

const DEFAULT_PLACEHOLDER = 'Ingredients, how to use, size guide…';

const EDITOR_CSS = `
.ie-html-editor {
  min-height: 160px;
  outline: none;
  font-size: 15px;
  line-height: 1.5;
  color: #0F1623;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.ie-html-editor p { margin: 0 0 8px; }
.ie-html-editor h3 { margin: 0 0 8px; font-size: 16px; font-weight: 700; }
.ie-html-editor ul, .ie-html-editor ol { margin: 0 0 8px; padding-left: 1.25rem; }
.ie-html-editor a { color: #123A6B; }
`;

function isEditorEmpty(el: HTMLElement) {
  return !el.innerText.replace(/\u00a0/g, ' ').trim();
}

function normalizeHtml(html: string) {
  return html === '<br>' || html === '<div><br></div>' ? '' : html;
}

function currentBlock(): string {
  try {
    return document.queryCommandValue('formatBlock').replace(/[<>]/g, '').toLowerCase();
  } catch {
    return '';
  }
}

export function HtmlEditorField({
  label = 'Product details',
  value,
  onChange,
  placeholder = DEFAULT_PLACEHOLDER,
}: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const skipSyncRef = useRef(false);
  const [empty, setEmpty] = useState(!value.trim());
  const [active, setActive] = useState({
    bold: false,
    italic: false,
    underline: false,
    heading: false,
    ul: false,
    ol: false,
  });

  useLayoutEffect(() => {
    if (document.getElementById('ie-html-editor-web-css')) return;
    const style = document.createElement('style');
    style.id = 'ie-html-editor-web-css';
    style.textContent = EDITOR_CSS;
    document.head.appendChild(style);
  }, []);

  const refreshActive = useCallback(() => {
    try {
      setActive({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        heading: currentBlock() === 'h3',
        ul: document.queryCommandState('insertUnorderedList'),
        ol: document.queryCommandState('insertOrderedList'),
      });
    } catch {
      /* ignore */
    }
  }, []);

  const emitChange = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    skipSyncRef.current = true;
    setEmpty(isEditorEmpty(el));
    onChange(normalizeHtml(el.innerHTML));
    refreshActive();
  }, [onChange, refreshActive]);

  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    const next = value || '';
    if (el.innerHTML !== next) el.innerHTML = next;
    setEmpty(isEditorEmpty(el));
  }, [value]);

  function apply(command: string, arg?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    emitChange();
  }

  function toggleHeading() {
    editorRef.current?.focus();
    document.execCommand('formatBlock', false, currentBlock() === 'h3' ? 'p' : 'h3');
    emitChange();
  }

  function applyLink() {
    editorRef.current?.focus();
    const url = window.prompt('Link URL', 'https://');
    if (!url?.trim()) return;
    apply('createLink', url.trim());
  }

  const editor = createElement('div', {
    ref: editorRef,
    className: 'ie-html-editor',
    contentEditable: true,
    role: 'textbox',
    'aria-multiline': true,
    'aria-label': label,
    suppressContentEditableWarning: true,
    onInput: emitChange,
    onKeyUp: refreshActive,
    onMouseUp: refreshActive,
    onFocus: refreshActive,
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'b') {
        event.preventDefault();
        apply('bold');
      } else if (key === 'i') {
        event.preventDefault();
        apply('italic');
      } else if (key === 'u') {
        event.preventDefault();
        apply('underline');
      }
    },
    style: { minHeight: 160, padding: 12 },
  });

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>Add rich details customers will see on the product page. Use the toolbar to format text.</Text>
      <View style={styles.shell}>
        <View style={styles.toolbar} accessibilityRole="toolbar">
          <Tool icon="bold" label="Bold" active={active.bold} onPress={() => apply('bold')} />
          <Tool icon="italic" label="Italic" active={active.italic} onPress={() => apply('italic')} />
          <Tool icon="underline" label="Underline" active={active.underline} onPress={() => apply('underline')} />
          <View style={styles.divider} />
          <Tool icon="type" label="Heading" active={active.heading} onPress={toggleHeading} />
          <Tool icon="list" label="Bulleted list" active={active.ul} onPress={() => apply('insertUnorderedList')} />
          <Tool text="1." label="Numbered list" active={active.ol} onPress={() => apply('insertOrderedList')} />
          <Tool icon="link" label="Link" onPress={applyLink} />
        </View>
        <View style={styles.editorWrap}>
          {empty ? <Text style={styles.placeholder}>{placeholder}</Text> : null}
          {editor}
        </View>
      </View>
    </View>
  );
}

function Tool({
  icon,
  text,
  label,
  active,
  onPress,
}: {
  icon?: React.ComponentProps<typeof Feather>['name'];
  text?: string;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      // Preserve the contenteditable selection (web mouse down would otherwise steal focus).
      onPressIn={(event) => event.preventDefault()}
      style={[styles.tool, active && styles.toolActive]}
    >
      {text ? (
        <Text style={[styles.toolText, active && styles.toolTextActive]}>{text}</Text>
      ) : (
        <Feather name={icon!} size={15} color={active ? colors.primary : colors.foreground} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.sm },
  label: { ...typography.label, color: colors.foreground },
  hint: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
  shell: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  divider: { width: 1, height: 18, backgroundColor: colors.border, marginHorizontal: 4 },
  tool: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolActive: { backgroundColor: colors.tint },
  toolText: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  toolTextActive: { color: colors.primary },
  editorWrap: { position: 'relative' },
  placeholder: {
    ...typography.body,
    color: colors.mutedForeground,
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 1,
    pointerEvents: 'none',
  },
});
