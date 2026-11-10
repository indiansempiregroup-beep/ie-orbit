import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import type { ShopBooksDocument, ShopBooksDocumentType, ShopBooksVoucher } from '@ie-orbit/sdk';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { getApiErrorMessage } from '../../lib/apiClient';
import { formatMoney } from '../../lib/currency';
import { formatVoucherWhen } from '../../lib/datetime';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { ShopBooksDocumentDialog } from './ShopBooksDocumentDialog';
import { useShopBooksDocumentMutations, useShopBooksDocuments } from './shopHooks';

function isVoucher(value: unknown): value is ShopBooksVoucher {
  return Boolean(value && typeof value === 'object' && 'voucher_number' in value);
}

export function ShopBooksDocumentsPage({
  docType,
  newPath,
}: {
  docType: Extract<ShopBooksDocumentType, 'sale_order' | 'purchase_order'>;
  /** Deprecated: the title is now derived from `docType` so it follows the UI language. */
  title?: string;
  newPath: string;
}) {
  const { t } = useTranslation();
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const currency = workspace.activeBusiness?.currency;
  const documents = useShopBooksDocuments(docType);
  const { convert } = useShopBooksDocumentMutations();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ShopBooksDocument | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const isPurchase = docType === 'purchase_order';
  const title = t(isPurchase ? 'nav.shopPurchaseOrders' : 'nav.shopSaleOrders');
  const statusLabel = (value: string) => {
    const key = value.toLowerCase();
    return ['draft', 'confirmed', 'converted', 'cancelled', 'void'].includes(key)
      ? t(`shop.booksDocuments.statuses.${key}`)
      : value;
  };
  const rows = documents.data ?? [];

  useEffect(() => {
    const documentId = searchParams.get('document');
    if (!documentId || !rows.length) return;
    const match = rows.find((row) => row.id === documentId);
    if (match) setSelected(match);
    const next = new URLSearchParams(searchParams);
    next.delete('document');
    setSearchParams(next, { replace: true });
  }, [rows, searchParams, setSearchParams]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!term) return true;
      return [row.document_number, row.customer_name, row.supplier_name, row.notes, row.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [rows, search]);

  async function convertRow(row: ShopBooksDocument) {
    if (!window.confirm(
        t(isPurchase ? 'shop.booksDocuments.confirmConvertPurchase' : 'shop.booksDocuments.confirmConvertSale', {
          number: row.document_number,
        }),
      )) {
      return;
    }
    try {
      const result = await convert.mutateAsync({ documentId: row.id });
      if (isVoucher(result)) {
        setMessage(t('shop.booksDocuments.convertedTo', { number: result.voucher_number }));
        navigate(isPurchase ? `/shop/books/purchase/${result.id}` : `/shop/books/sale/${result.id}`);
        return;
      }
      setMessage(t('shop.booksDocuments.converted', { number: row.document_number }));
    } catch (error) {
      setMessage(getApiErrorMessage(error, t('shop.booksDocuments.errConvert')));
    }
  }

  return (
    <div className="page-stack">
      <div className="invoice-page-header">
        <h1 className="invoice-page-title">{title}</h1>
        <Link to={newPath} style={{ textDecoration: 'none' }}>
          <Button type="button" variant="primary">
            <Plus size={16} aria-hidden="true" /> {t('shop.booksDocuments.new')}
          </Button>
        </Link>
      </div>
      <Card>
        {message ? <p role="status">{message}</p> : null}
        <label style={{ position: 'relative', display: 'block', marginBottom: 16 }}>
          <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: 12, top: 12, color: 'var(--muted-foreground)' }} />
          <input
            aria-label={t(isPurchase ? 'shop.booksDocuments.searchAriaPurchase' : 'shop.booksDocuments.searchAriaSale')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('shop.booksDocuments.searchPlaceholder')}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px 10px 36px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10 }}
          />
        </label>
        {documents.isLoading ? <p role="status">{t('common.loading')}</p> : null}
        {documents.error ? <p role="alert">{getApiErrorMessage(documents.error, t('shop.booksDocuments.errLoad'))}</p> : null}
        {!documents.isLoading && !filtered.length ? <p>{t(isPurchase ? 'shop.booksDocuments.emptyPurchase' : 'shop.booksDocuments.emptySale')}</p> : null}
        <div className="invoice-list">
          {filtered.map((row) => {
            const converted = Boolean(row.converted_voucher || row.status.toLowerCase() === 'converted');
            const party = row.supplier_name || row.customer_name || (isPurchase ? t('shop.booksDocuments.noSupplier') : t('shop.booksDocuments.noCustomer'));
            return (
              <div
                key={row.id}
                className="invoice-row"
                role="button"
                tabIndex={0}
                onClick={() => setSelected(row)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') setSelected(row);
                }}
                style={{ cursor: 'pointer' }}
              >
                <div className="invoice-row__main">
                  <strong>{party}</strong>
                  <span>
                    {row.document_number}
                    {row.document_date || row.created_at
                      ? ` · ${formatVoucherWhen(row.document_date, row.created_at)}`
                      : ''}
                  </span>
                </div>
                <div className="invoice-row__side">
                  <strong>{formatMoney(Number(row.total ?? 0), currency)}</strong>
                  <span className={`invoice-pill ${converted ? 'is-paid' : 'is-due'}`}>
                    {converted ? t('shop.booksDocuments.convertedBadge') : statusLabel(row.status)}
                  </span>
                </div>
                {!converted ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={convert.isPending}
                    onClick={(event) => {
                      event.stopPropagation();
                      void convertRow(row);
                    }}
                  >
                    {isPurchase ? t('shop.booksDocuments.convertToPurchase') : t('shop.booksDocuments.convertToSale')}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>
      <ShopBooksDocumentDialog
        document={selected}
        docType={docType}
        currency={currency}
        onClose={() => setSelected(null)}
        onMessage={setMessage}
      />
    </div>
  );
}
