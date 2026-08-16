import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Bold, Heading3, Italic, Link as LinkIcon, List, ListOrdered, Underline } from 'lucide-react';

type Props = {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
};

const DEFAULT_PLACEHOLDER = 'Ingredients, how to use, size guide…';

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
      /* execCommand can throw if the selection is outside the document */
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

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
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
  }

  return (
    <div style={{ display: 'grid', gap: 8, gridColumn: '1 / -1' }}>
      <style>{EDITOR_CSS}</style>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{label}</span>
      <span style={{ fontSize: 12, color: '#6b7280' }}>
        Add rich details customers will see on the product page. Use the toolbar to format text.
      </span>
      <div style={shellStyle}>
        <div style={toolbarStyle} role="toolbar" aria-label="Formatting">
          <Tool label="Bold" active={active.bold} onClick={() => apply('bold')}>
            <Bold size={15} strokeWidth={2.4} />
          </Tool>
          <Tool label="Italic" active={active.italic} onClick={() => apply('italic')}>
            <Italic size={15} strokeWidth={2.4} />
          </Tool>
          <Tool label="Underline" active={active.underline} onClick={() => apply('underline')}>
            <Underline size={15} strokeWidth={2.4} />
          </Tool>
          <span style={dividerStyle} />
          <Tool label="Heading" active={active.heading} onClick={toggleHeading}>
            <Heading3 size={15} strokeWidth={2.4} />
          </Tool>
          <Tool label="Bulleted list" active={active.ul} onClick={() => apply('insertUnorderedList')}>
            <List size={15} strokeWidth={2.4} />
          </Tool>
          <Tool label="Numbered list" active={active.ol} onClick={() => apply('insertOrderedList')}>
            <ListOrdered size={15} strokeWidth={2.4} />
          </Tool>
          <Tool label="Link" onClick={applyLink}>
            <LinkIcon size={15} strokeWidth={2.4} />
          </Tool>
        </div>
        <div
          ref={editorRef}
          className="ie-html-editor"
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label={label}
          data-placeholder={placeholder}
          data-empty={empty ? 'true' : 'false'}
          suppressContentEditableWarning
          onInput={emitChange}
          onKeyDown={onKeyDown}
          onKeyUp={refreshActive}
          onMouseUp={refreshActive}
          onFocus={refreshActive}
        />
      </div>
    </div>
  );
}

function Tool({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active ?? false}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        border: 'none',
        borderRadius: 6,
        background: active ? '#e5edf8' : 'transparent',
        color: active ? '#123A6B' : '#374151',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

const shellStyle: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  overflow: 'hidden',
  background: '#fff',
};

const toolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  flexWrap: 'wrap',
  padding: '6px 8px',
  borderBottom: '1px solid #e5e7eb',
  background: '#f8fafc',
};

const dividerStyle: CSSProperties = {
  width: 1,
  height: 18,
  background: '#e5e7eb',
  margin: '0 4px',
};

const EDITOR_CSS = `
.ie-html-editor {
  min-height: 160px;
  max-height: 320px;
  overflow: auto;
  padding: 12px;
  outline: none;
  font-size: 14px;
  line-height: 1.55;
  color: #111827;
  position: relative;
}
.ie-html-editor[data-empty="true"]:before {
  content: attr(data-placeholder);
  color: #9ca3af;
  pointer-events: none;
  position: absolute;
}
.ie-html-editor p { margin: 0 0 8px; }
.ie-html-editor h3 { margin: 0 0 8px; font-size: 16px; font-weight: 700; }
.ie-html-editor ul, .ie-html-editor ol { margin: 0 0 8px; padding-left: 1.25rem; }
.ie-html-editor a { color: #2563eb; }
`;
