import React, { useState } from 'react';
import { HelpPanel, HelpTip } from './HelpTip';

/** Section title with clickable ? that opens a help dialog. */
export function WidgetHelpTitle({
  title,
  help,
  as: Tag = 'h2',
}: {
  title: string;
  help: string;
  as?: 'h2' | 'h3';
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, maxWidth: '100%', flexWrap: 'wrap' }}>
      <Tag style={{ marginTop: 0, marginBottom: 0 }}>{title}</Tag>
      <HelpTip label={title} open={open} onToggle={() => setOpen((value) => !value)} size="md" />
      <HelpPanel title={title} help={help} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
