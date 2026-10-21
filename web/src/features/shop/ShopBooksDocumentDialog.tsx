import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ShopBooksDocument, ShopBooksDocumentType, ShopBooksVoucher } from '@ie-orbit/sdk';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { getApiErrorMessage } from '../../lib/apiClient';
import { formatMoney } from '../../lib/currency';
import { useShopBooksDocumentMutations } from './shopHooks';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled' },
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
  const party = document?.supplier_name || document?.customer_name || (docType === 'purchase_order' ? 'No supplier' : 'No customer');

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
      onMessage(`${document.document_number} updated.`);
      onClose();
    } catch (error) {
      onMessage(getApiErrorMessage(error, "Couldn't update this document. Try again."));
    }
  }

  async function runConvert(action?: 'dispatch' | 'to_invoice') {
    if (!document) return;
    const dispatching = isChallan && action !== 'to_invoice';
    const prompt = dispatching
      ? `Mark ${document.document_number} as dispatched and reduce stock?`
      : isChallan
        ? `Create a sale invoice from ${document.document_number}?`
        : `Convert ${document.document_number} into a ${docType === 'purchase_order' ? 'purchase bill' : 'sale invoice'}?`;
    if (!window.confirm(prompt)) return;
    try {
      const result = await convert.mutateAsync({
        documentId: document.id,
        action,
      });
      if (isVoucher(result)) {
        onMessage(`Converted to ${result.voucher_number}.`);
        onClose();
        navigate(
          docType === 'purchase_order'
            ? `/shop/books/purchase/${result.id}`
            : `/shop/books/sale/${result.id}`,
        );
        return;
      }
      onMessage(dispatching ? `${document.document_number} dispatched.` : `${document.document_number} updated.`);
      onClose();
    } catch (error) {
      onMessage(getApiErrorMessage(error, "Couldn't convert this document. Try again."));
    }
  }

  return (
    <Dialog
      open={Boolean(document)}
      onClose={onClose}
      title={document?.document_number || 'Document'}
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
              const name = String(line.name || `Item ${index + 1}`);
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
            {!document.line_items?.length ? <p style={{ margin: 0 }}>No line items.</p> : null}
          </div>
          {locked ? (
            <p style={{ margin: 0, fontSize: 13 }}>
              {converted
                ? 'This document has been converted and can no longer be edited.'
                : dispatched
                  ? 'Goods have left. Create an invoice when you bill the customer.'
                  : 'This document is cancelled.'}
            </p>
          ) : (
            <>
              <Select label="Status" value={status} onChange={(event) => setStatus(event.target.value)} options={STATUS_OPTIONS} />
              <Input label="Date" type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} />
              <label className="ui-field">
                <span className="ui-field-label">Notes</span>
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
                Edit items
              </Button>
            ) : null}
            {!locked ? (
              <Button type="button" variant="neutral" onClick={() => void save()} disabled={update.isPending}>
                {update.isPending ? 'Saving…' : 'Save'}
              </Button>
            ) : null}
            {isChallan && !converted && !dispatched ? (
              <Button type="button" variant="ghost" onClick={() => void runConvert('dispatch')} disabled={convert.isPending}>
                Dispatch
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
                Open converted bill
              </Button>
            ) : null}
            {!converted && (docType !== 'delivery_challan' || dispatched || !locked) ? (
              <Button
                type="button"
                onClick={() => void runConvert(isChallan ? 'to_invoice' : undefined)}
                disabled={convert.isPending || (docType !== 'delivery_challan' && locked)}
              >
                {convert.isPending
                  ? 'Working…'
                  : isChallan
                    ? 'Create invoice'
                    : docType === 'purchase_order'
                      ? 'Convert to purchase'
                      : 'Convert to sale'}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
