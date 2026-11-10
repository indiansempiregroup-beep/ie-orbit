import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ShopBooksDocument, ShopBooksDocumentType, ShopBooksVoucher } from '@ie-orbit/sdk';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { getApiErrorMessage } from '../../lib/apiClient';
import { formatMoney } from '../../lib/currency';
import { useShopBooksDocumentMutations } from './shopHooks';

const STATUS_OPTIONS = [
  { value: 'draft', labelKey: 'shop.booksDocDialog.statusDraft' },
  { value: 'confirmed', labelKey: 'shop.booksDocDialog.statusConfirmed' },
  { value: 'cancelled', labelKey: 'shop.booksDocDialog.statusCancelled' },
];

function isLocked(doc: ShopBooksDocument) {
  const status = (doc.status || '').toLowerCase();
  return Boolean(doc.converted_voucher) || status === 'converted' || status === 'cancelled' || status === 'dispatched';
}

function isVoucher(value: unknown): value is ShopBooksVoucher {
  return Boolean(value && typeof value === 'object' && 'voucher_number' in value);
}

export function ShopBooksDocumentDialog({
  document,
  docType,
  currency,
  onClose,
  onMessage,
}: {
  document: ShopBooksDocument | null;
  docType: ShopBooksDocumentType;
  currency?: string | null;
  onClose: () => void;
  onMessage: (message: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { update, convert } = useShopBooksDocumentMutations();
  const [status, setStatus] = useState('confirmed');
  const [notes, setNotes] = useState('');
  const [documentDate, setDocumentDate] = useState('');

  useEffect(() => {
    if (!document) return;
    setStatus((document.status || 'confirmed').toLowerCase());
    setNotes(document.notes || '');
    setDocumentDate(document.document_date || '');
  }, [document?.id]);

  const locked = document ? isLocked(document) : true;
  const dispatched = (document?.status || '').toLowerCase() === 'dispatched';
  const converted = Boolean(document?.converted_voucher || (document?.status || '').toLowerCase() === 'converted');
  const isChallan = docType === 'delivery_challan';
  const party = document?.supplier_name || document?.customer_name || (docType === 'purchase_order' ? t('shop.booksDocuments.noSupplier') : t('shop.booksDocuments.noCustomer'));

  async function save() {
    if (!document) return;
    try {
      await update.mutateAsync({
        documentId: document.id,
        body: {
          status,
          notes,
          document_date: documentDate || null,
        },
      });
      onMessage(t('shop.booksDocDialog.updated', { number: document.document_number }));
      onClose();
    } catch (error) {
      onMessage(getApiErrorMessage(error, t('shop.booksDocDialog.updateFailed')));
    }
  }

  async function runConvert(action?: 'dispatch' | 'to_invoice') {
    if (!document) return;
    const dispatching = isChallan && action !== 'to_invoice';
    const prompt = dispatching
      ? t('shop.booksDocDialog.confirmDispatch', { number: document.document_number })
      : isChallan
        ? t('shop.booksDocDialog.confirmChallanInvoice', { number: document.document_number })
        : docType === 'purchase_order'
          ? t('shop.booksDocuments.confirmConvertPurchase', { number: document.document_number })
          : t('shop.booksDocuments.confirmConvertSale', { number: document.document_number });
    if (!window.confirm(prompt)) return;
    try {
      const result = await convert.mutateAsync({
        documentId: document.id,
        action,
      });
      if (isVoucher(result)) {
        onMessage(t('shop.booksDocuments.convertedTo', { number: result.voucher_number }));
        onClose();
        navigate(
          docType === 'purchase_order'
            ? `/shop/books/purchase/${result.id}`
            : `/shop/books/sale/${result.id}`,
        );
        return;
      }
      onMessage(
        dispatching
          ? t('shop.booksDocDialog.dispatched', { number: document.document_number })
          : t('shop.booksDocDialog.updated', { number: document.document_number }),
      );
      onClose();
    } catch (error) {
      onMessage(getApiErrorMessage(error, t('shop.booksDocuments.errConvert')));
    }
  }

  return (
    <Dialog
      open={Boolean(document)}
      onClose={onClose}
      title={document?.document_number || t('shop.booksDocDialog.defaultTitle')}
      labelledBy="books-document-dialog"
      busy={update.isPending || convert.isPending}
    >
      {document ? (
        <div style={{ display: 'grid', gap: 14, marginTop: 12, minWidth: 320 }}>
          <div style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>
            {party} · {document.status} · {formatMoney(Number(document.total ?? 0), currency)}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {((document.line_items as Array<Record<string, unknown>> | undefined) ?? []).map((line, index) => {
              const productId = String(line.product_id || '').trim();
              const name = String(line.name || t('shop.booksDocDialog.itemFallback', { n: index + 1 }));
              const qty = line.quantity ?? line.qty ?? 0;
              const label = `${name} × ${qty}`;
              return (
                <div key={index} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  {productId ? (
                    <Link to={`/shop/products?product=${encodeURIComponent(productId)}`}>{label}</Link>
                  ) : (
                    <span>{label}</span>
                  )}
                  <strong>{formatMoney(Number(line.line_total ?? 0), currency)}</strong>
                </div>
              );
            })}
            {!document.line_items?.length ? <p style={{ margin: 0 }}>{t('shop.booksDocDialog.noLines')}</p> : null}
          </div>
          {locked ? (
            <p style={{ margin: 0, fontSize: 13 }}>
              {converted
                ? t('shop.booksDocDialog.lockedConverted')
                : dispatched
                  ? t('shop.booksDocDialog.lockedDispatched')
                  : t('shop.booksDocDialog.lockedCancelled')}
            </p>
          ) : (
            <>
              <Select
                label={t('common.status')}
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                options={STATUS_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
              />
              <Input label={t('shop.booksDocDialog.date')} type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} />
              <label className="ui-field">
                <span className="ui-field-label">{t('shop.booksDocDialog.notes')}</span>
                <textarea className="ui-control" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
              </label>
            </>
          )}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {!locked ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  onClose();
                  navigate(`/shop/pos?mode=${docType}&document=${document.id}`);
                }}
              >
                {t('shop.booksDocDialog.editItems')}
              </Button>
            ) : null}
            {!locked ? (
              <Button type="button" variant="neutral" onClick={() => void save()} disabled={update.isPending}>
                {update.isPending ? t('common.saving') : t('common.save')}
              </Button>
            ) : null}
            {isChallan && !converted && !dispatched ? (
              <Button type="button" variant="ghost" onClick={() => void runConvert('dispatch')} disabled={convert.isPending}>
                {t('shop.booksDocDialog.dispatch')}
              </Button>
            ) : null}
            {converted && document.converted_voucher ? (
              <Button
                type="button"
                onClick={() => {
                  onClose();
                  navigate(
                    docType === 'purchase_order'
                      ? `/shop/books/purchase/${document.converted_voucher}`
                      : `/shop/books/sale/${document.converted_voucher}`,
                  );
                }}
              >
                {t('shop.booksDocDialog.openConverted')}
              </Button>
            ) : null}
            {!converted && (docType !== 'delivery_challan' || dispatched || !locked) ? (
              <Button
                type="button"
                onClick={() => void runConvert(isChallan ? 'to_invoice' : undefined)}
                disabled={convert.isPending || (docType !== 'delivery_challan' && locked)}
              >
                {convert.isPending
                  ? t('shop.booksDocDialog.working')
                  : isChallan
                    ? t('shop.booksDocDialog.createInvoice')
                    : docType === 'purchase_order'
                      ? t('shop.booksDocuments.convertToPurchase')
                      : t('shop.booksDocuments.convertToSale')}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
