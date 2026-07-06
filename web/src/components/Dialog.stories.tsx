import React from 'react';
import { Dialog } from './Dialog';
import { useDialog } from '../hooks/useDialog';

export default { title: 'Components/Dialog' };

export const Basic = () => {
  const d = useDialog();
  return (
    <div>
      <button onClick={() => d.show()}>Open</button>
      <Dialog open={d.open} onClose={() => d.hide()} title="Basic Dialog" labelledBy="basic-dialog">
        <p>This is a basic dialog. Click outside or press Escape to close.</p>
        <button onClick={() => d.hide()}>Close</button>
      </Dialog>
    </div>
  );
};

export const Confirm = () => {
  const d = useDialog<string>();
  return (
    <div>
      <button onClick={() => d.show('Are you sure?')}>Open Confirm</button>
      <Dialog open={d.open} onClose={() => d.hide()} title="Confirm" labelledBy="confirm-dialog">
        <p>{d.payload ?? 'Confirm action?'}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => d.hide()}>Cancel</button>
          <button onClick={() => { d.hide(); /* perform confirm action */ }}>Confirm</button>
        </div>
      </Dialog>
    </div>
  );
};
