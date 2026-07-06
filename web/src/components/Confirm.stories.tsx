import React from 'react';
import { useConfirm } from '../hooks/useConfirm';

export default { title: 'Utilities/Confirm' };

export const Basic = () => {
  const confirm = useConfirm();
  return (
    <div>
      <button
        onClick={async () => {
          const ok = await confirm({ title: 'Delete', message: 'Delete this item?' });
          // eslint-disable-next-line no-alert
          alert(`confirmed=${ok}`);
        }}
      >
        Open Confirm
      </button>
    </div>
  );
};
