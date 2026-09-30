import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ShopMasterKind, ShopMasterRecord } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';

const KINDS: Array<{ kind: ShopMasterKind; title: string; blurb: string }> = [
  { kind: 'category', title: 'Product categories', blurb: 'Used on products and filters' },
  { kind: 'brand', title: 'Brands', blurb: 'Reusable brand names' },
  { kind: 'unit', title: 'Units', blurb: 'Pcs, kg, litre, and more' },
  { kind: 'expense_category', title: 'Expense categories', blurb: 'Books expense entries' },
  { kind: 'income_category', title: 'Income categories', blurb: 'Other income entries' },
  { kind: 'tax_rate', title: 'Tax rates', blurb: 'GST % presets for products' },
];

export function ShopMasterFilesPage() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ margin: 0 }}>Master Files</h1>
        <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
          Shop-owned lookups you can reuse on products and books. Choosing Other on a product also saves here.
        </p>
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
        {KINDS.map((item) => (
          <Card key={item.kind}>
            <Link to={`/shop/master/${item.kind}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <h3 style={{ margin: '0 0 6px' }}>{item.title}</h3>
              <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>{item.blurb}</p>
            </Link>
          </Card>
        ))}
      </div>
      <Card>
        <h3 style={{ marginTop: 0 }}>Also in your shop</h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Link to="/shop/godowns">Godowns</Link>
          <Link to="/shop/books/cash">Cash & bank</Link>
          <Link to="/shop/books/parties">Parties</Link>
        </div>
      </Card>
    </div>
  );
}

export function ShopMasterKindPage() {
  const { kind = 'category' } = useParams<{ kind: string }>();
  const meta = KINDS.find((item) => item.kind === kind) || {
    kind: kind as ShopMasterKind,
    title: kind,
    blurb: '',
  };
  const client = useApiClient();
  const workspace = useWorkspace();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const businessId = workspace.activeBusiness?.id || '';
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');

  const listQuery = useQuery({
    queryKey: ['shop-master', kind, businessId],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const response = await client.shop.listMasterRecords(kind, {
        business_id: businessId,
        include_inactive: true,
      });
      return response.data.items;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await client.shop.createMasterRecord(kind, {
        business_id: businessId,
        label: label.trim(),
        value:
          kind === 'tax_rate' ? value.trim() || label.trim().replace(/[^\d.]/g, '') : value.trim(),
      });
    },
    onSuccess: async () => {
      setLabel('');
      setValue('');
      snackbar.push('Saved to master files.', 'success');
      await queryClient.invalidateQueries({ queryKey: ['shop-master', kind, businessId] });
      if (kind === 'category') {
        await queryClient.invalidateQueries({ queryKey: ['shop-product-categories', businessId] });
      }
    },
    onError: (error) => snackbar.push(getApiErrorMessage(error, 'Unable to save master file.'), 'error'),
  });

  const patchMutation = useMutation({
    mutationFn: async (row: ShopMasterRecord) => {
      await client.shop.patchMasterRecord(kind, row.id, { is_active: !row.is_active });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['shop-master', kind, businessId] });
    },
    onError: (error) => snackbar.push(getApiErrorMessage(error, 'Unable to update master file.'), 'error'),
  });

  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <Link to="/shop/master" style={{ fontSize: 14 }}>
          ← Master Files
        </Link>
        <h1 style={{ margin: '8px 0 0' }}>{meta.title}</h1>
        <p style={{ margin: '8px 0 0', color: '#6b7280' }}>{meta.blurb}</p>
      </div>
      <Card>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: kind === 'tax_rate' ? '1fr 120px auto' : '1fr auto' }}>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={kind === 'tax_rate' ? 'GST 18%' : 'New value'}
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          {kind === 'tax_rate' ? (
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="18"
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          ) : null}
          <Button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!label.trim() || createMutation.isPending}
          >
            Add
          </Button>
        </div>
      </Card>
      <Card>
        {listQuery.isLoading ? <p>Loading…</p> : null}
        {!listQuery.isLoading && !rows.length ? <p style={{ color: '#6b7280' }}>No items yet.</p> : null}
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((row) => (
            <div
              key={row.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px solid #f3f4f6',
                opacity: row.is_active ? 1 : 0.55,
              }}
            >
              <div>
                <strong>{row.label}</strong>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  {row.slug}
                  {row.value ? ` · ${row.value}` : ''}
                  {row.is_builtin ? ' · builtin' : ''}
                  {!row.is_active ? ' · inactive' : ''}
                </div>
              </div>
              <Button type="button" variant="neutral" onClick={() => patchMutation.mutate(row)}>
                {row.is_active ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
