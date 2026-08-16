import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Props = {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
};

const DEFAULT_PLACEHOLDER = 'Ingredients, how to use, size guide…';

function buildEditorHtml(placeholder: string) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <style>
    html, body { margin: 0; padding: 0; background: #fff; font-family: system-ui, -apple-system, sans-serif; }
    .toolbar {
      display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
      padding: 6px 8px; border-bottom: 1px solid #DDE2E7; background: #F3F4F8;
    }
    .toolbar button {
      width: 32px; height: 32px; border: 0; border-radius: 6px; background: transparent;
      font: 700 13px/1 system-ui, sans-serif; color: #0F1623;
    }
    .toolbar button.active { background: #E8EEF6; color: #123A6B; }
    .editor {
      min-height: 160px; padding: 12px; outline: none; font-size: 15px; line-height: 1.5; color: #0F1623;
    }
    .editor[data-empty="true"]:before { content: attr(data-placeholder); color: #6B7A99; pointer-events: none; }
    .editor p { margin: 0 0 8px; }
    .editor h3 { margin: 0 0 8px; font-size: 16px; font-weight: 700; }
    .editor ul, .editor ol { margin: 0 0 8px; padding-left: 1.25rem; }
    .editor a { color: #123A6B; }
    .link-box {
      display: none; padding: 8px; border-bottom: 1px solid #DDE2E7; background: #fff; gap: 8px; align-items: center;
    }
    .link-box.open { display: flex; }
    .link-box input {
      flex: 1; min-width: 0; height: 32px; border: 1px solid #DDE2E7; border-radius: 8px; padding: 0 8px; font-size: 14px;
    }
    .link-box button { height: 32px; border: 0; border-radius: 8px; padding: 0 10px; font-weight: 700; background: #123A6B; color: #fff; }
    .link-box button.secondary { background: #E8EEF6; color: #123A6B; }
  </style>
</head>
<body>
  <div class="toolbar" role="toolbar" aria-label="Formatting">
    <button type="button" data-cmd="bold" aria-label="Bold"><b>B</b></button>
    <button type="button" data-cmd="italic" aria-label="Italic"><i>I</i></button>
    <button type="button" data-cmd="underline" aria-label="Underline"><u>U</u></button>
    <button type="button" data-cmd="h3" aria-label="Heading">H</button>
    <button type="button" data-cmd="insertUnorderedList" aria-label="Bulleted list">•</button>
    <button type="button" data-cmd="insertOrderedList" aria-label="Numbered list">1.</button>
    <button type="button" data-cmd="link" aria-label="Link">🔗</button>
  </div>
  <div class="link-box" id="linkBox">
    <input id="linkUrl" type="url" placeholder="https://" />
    <button type="button" id="linkOk">Add</button>
    <button type="button" class="secondary" id="linkCancel">Cancel</button>
  </div>
  <div id="editor" class="editor" contenteditable="true" role="textbox" aria-multiline="true" data-empty="true" data-placeholder=${JSON.stringify(placeholder)}></div>
  <script>
    const editor = document.getElementById('editor');
    const linkBox = document.getElementById('linkBox');
    const linkUrl = document.getElementById('linkUrl');
    function currentBlock() {
      try { return document.queryCommandValue('formatBlock').replace(/[<>]/g, '').toLowerCase(); }
      catch (e) { return ''; }
    }
    function normalize(html) {
      return html === '<br>' || html === '<div><br></div>' ? '' : html;
    }
    function syncEmpty() {
      var empty = !editor.innerText.replace(/\u00a0/g, ' ').trim();
      editor.setAttribute('data-empty', empty ? 'true' : 'false');
    }
    function emit() {
      syncEmpty();
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'change', html: normalize(editor.innerHTML) }));
      }
      refresh();
    }
    function refresh() {
      document.querySelectorAll('[data-cmd]').forEach(function (btn) {
        var cmd = btn.getAttribute('data-cmd');
        var on = false;
        try {
          if (cmd === 'h3') on = currentBlock() === 'h3';
          else if (cmd === 'link') on = false;
          else on = document.queryCommandState(cmd);
        } catch (e) {}
        btn.classList.toggle('active', !!on);
      });
    }
    window.__setHtml = function (html) {
      var next = html || '';
      if (editor.innerHTML !== next) editor.innerHTML = next;
      syncEmpty();
    };
    document.querySelectorAll('[data-cmd]').forEach(function (btn) {
      btn.addEventListener('mousedown', function (event) { event.preventDefault(); });
      btn.addEventListener('click', function () {
        var cmd = btn.getAttribute('data-cmd');
        editor.focus();
        if (cmd === 'h3') {
          document.execCommand('formatBlock', false, currentBlock() === 'h3' ? 'p' : 'h3');
        } else if (cmd === 'link') {
          linkBox.classList.add('open');
          linkUrl.value = 'https://';
          linkUrl.focus();
          return;
        } else {
          document.execCommand(cmd, false);
        }
        emit();
      });
    });
    document.getElementById('linkOk').addEventListener('click', function () {
      var url = (linkUrl.value || '').trim();
      linkBox.classList.remove('open');
      editor.focus();
      if (url) document.execCommand('createLink', false, url);
      emit();
    });
    document.getElementById('linkCancel').addEventListener('click', function () {
      linkBox.classList.remove('open');
      editor.focus();
    });
    editor.addEventListener('input', emit);
    editor.addEventListener('keyup', refresh);
    editor.addEventListener('mouseup', refresh);
    editor.addEventListener('keydown', function (event) {
      if (!(event.metaKey || event.ctrlKey)) return;
      var key = event.key.toLowerCase();
      if (key === 'b') { event.preventDefault(); document.execCommand('bold'); emit(); }
      if (key === 'i') { event.preventDefault(); document.execCommand('italic'); emit(); }
      if (key === 'u') { event.preventDefault(); document.execCommand('underline'); emit(); }
    });
  </script>
</body>
</html>`;
}

export function HtmlEditorField({
  label = 'Product details',
  value,
  onChange,
  placeholder = DEFAULT_PLACEHOLDER,
}: Props) {
  const webRef = useRef<WebView>(null);
  const lastHtmlRef = useRef(value);
  const loadedRef = useRef(false);
  const html = useMemo(() => buildEditorHtml(placeholder), [placeholder]);

  useEffect(() => {
    if (!loadedRef.current) return;
    if (value === lastHtmlRef.current) return;
    lastHtmlRef.current = value;
    webRef.current?.injectJavaScript(`window.__setHtml(${JSON.stringify(value || '')}); true;`);
  }, [value]);

  function onMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data) as { type?: string; html?: string };
      if (data.type === 'change' && typeof data.html === 'string') {
        lastHtmlRef.current = data.html;
        onChange(data.html);
      }
    } catch {
      /* ignore malformed messages */
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>Add rich details customers will see on the product page. Use the toolbar to format text.</Text>
      <View style={styles.shell}>
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html }}
          style={styles.webview}
          scrollEnabled
          nestedScrollEnabled
          hideKeyboardAccessoryView
          keyboardDisplayRequiresUserAction={false}
          onMessage={onMessage}
          onLoadEnd={() => {
            loadedRef.current = true;
            webRef.current?.injectJavaScript(`window.__setHtml(${JSON.stringify(value || '')}); true;`);
          }}
        />
      </View>
    </View>
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
    minHeight: 240,
  },
  webview: {
    height: 240,
    backgroundColor: 'transparent',
  },
});
