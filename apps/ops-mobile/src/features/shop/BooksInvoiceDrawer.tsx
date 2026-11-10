import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ShopBooksVoucher } from '@ie-orbit/sdk';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useToast } from '../../contexts/ToastContext';
import { getApiErrorMessage } from '../../utils/format';
import { SaleInvoiceDetailModal } from './SaleInvoiceDetailModal';

type Props = {
  voucherId: string | null;
  visible: boolean;
  onClose: () => void;
};

/** Loads a books sale invoice and opens the same detail popup used on Sale invoices. */
export function BooksInvoiceDrawer({ voucherId, visible, onClose }: Props) {
  const { t } = useTranslation();
  const client = useOpsClient();
  const toast = useToast();
  const [voucher, setVoucher] = useState<ShopBooksVoucher | null>(null);

  useEffect(() => {
    if (!visible || !voucherId || !client) {
      if (!visible) setVoucher(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await client.shop.getVoucher(voucherId);
        if (!cancelled) setVoucher(response.data);
      } catch (err) {
        if (!cancelled) {
          setVoucher(null);
          toast.push(getApiErrorMessage(err, t('opsApp.shop.booksDrawer.openFailed')), 'error');
          onClose();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- parent passes inline onClose
  }, [visible, voucherId, client, toast]);

  return (
    <SaleInvoiceDetailModal
      voucher={voucher}
      visible={visible && Boolean(voucher)}
      onClose={onClose}
    />
  );
}
