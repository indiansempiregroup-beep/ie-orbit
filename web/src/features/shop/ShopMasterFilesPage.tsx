import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Grid3X3,
  Heart,
  Package,
  Percent,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import type { ShopMasterKind, ShopMasterRecord } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';

type KindMeta = {
  kind: ShopMasterKind;
  title: string;
  blurb: string;
  icon: LucideIcon;
  placeholder: string;
};

const KINDS: KindMeta[] = [
  { kind: 'category', title: 'Product categories', blurb: 'Used on products and store filters', icon: Grid3X3, placeholder: 'e.g. Pet food' },
  { kind: 'brand', title: 'Brands', blurb: 'Reusable brand names on products', icon: Tag, placeholder: 'e.g. Pedigree' },
  { kind: 'unit', title: 'Units', blurb: 'Pcs, kg, litre, and more', icon: Package, placeholder: 'e.g. Bundle' },
  { kind: 'expense_category', title: 'Expense categories', blurb: 'Books expense entries', icon: TrendingDown, placeholder: 'e.g. Packaging' },
  { kind: 'income_category', title: 'Income categories', blurb: 'Other income entries', icon: TrendingUp, placeholder: 'e.g. Commission' },
  { kind: 'tax_rate', title: 'Tax rates', blurb: 'GST % presets for products', icon: Percent, placeholder: 'e.g. GST 18%' },
  { kind: 'pet_species', title: 'Pet species', blurb: 'Dog, Cat, and custom species', icon: Heart, placeholder: 'e.g. Hamster' },
];

const fieldStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid #e5e7eb',
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
};

type FilterKey = 'all' | 'active' | 'inactive';

export function ShopMasterFilesPage() {
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>Master Files</h1>
        <p style={{ margin: '8px 0 0', color: '#6b7280', maxWidth: 560, lineHeight: 1.5 }}>
          Reusable lists for products and books — add once, pick everywhere.
        </p>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
        {KINDS.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.kind} to={`/shop/master/${item.kind}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <Card style={{ height: '100%', transition: 'border-color 120ms ease' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      background: '#E4EEF1',
                      color: '#163a47',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={18} />
                  </div>
                  <div>
                    <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>{item.title}</h3>
                    <p style={{ margin: 0, color: '#6b7280', fontSize: 13, lineHeight: 1.45 }}>{item.blurb}</p>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Also in your shop</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { to: '/shop/godowns', label: 'Godowns' },
            { to: '/shop/books/cash', label: 'Cash & bank' },
            { to: '/shop/books/parties', label: 'Parties' },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              style={{
                textDecoration: 'none',
                color: '#163a47',
                fontWeight: 600,
                fontSize: 14,
                padding: '8px 12px',
                borderRadius: 999,
                background: '#E4EEF1',
              }}
            >
              {item.label}
            </Link>
          ))}
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
    blurb: 'Reusable shop values',
    icon: Package,
    placeholder: 'New value',
  };
  const Icon = meta.icon;
  const client = useApiClient();
  const workspace = useWorkspace();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const businessId = workspace.activeBusiness?.id || '';
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

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
      setFilter('all');
      setSearch('');
      snackbar.push('Entry added.', 'success');
      await queryClient.invalidateQueries({ queryKey: ['shop-master', kind, businessId] });
      if (kind === 'category') {
        await queryClient.invalidateQueries({ queryKey: ['shop-product-categories', businessId] });
      }
    },
    onError: (error) => snackbar.push(getApiErrorMessage(error, "Couldn't save this entry. Try again."), 'error'),
  });

  const patchMutation = useMutation({
    mutationFn: async (row: ShopMasterRecord) => {
      await client.shop.patchMasterRecord(kind, row.id, { is_active: !row.is_active });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['shop-master', kind, businessId] });
      snackbar.push('Entry updated.', 'success');
    },
    onError: (error) => snackbar.push(getApiErrorMessage(error, "Couldn't save this entry. Try again."), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (row: ShopMasterRecord) => {
      await client.shop.deleteMasterRecord(kind, row.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['shop-master', kind, businessId] });
      snackbar.push('Entry removed.', 'success');
    },
    onError: (error) => snackbar.push(getApiErrorMessage(error, "Couldn't save this entry. Try again."), 'error'),
  });

  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const counts = useMemo(() => {
    const active = rows.filter((row) => row.is_active).length;
    return { total: rows.length, active, inactive: rows.length - active };
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === 'active' && !row.is_active) return false;
      if (filter === 'inactive' && row.is_active) return false;
      if (!q) return true;
      return (
        row.label.toLowerCase().includes(q) ||
        row.slug.toLowerCase().includes(q) ||
        String(row.value || '')
          .toLowerCase()
          .includes(q)
      );
    });
  }, [filter, rows, search]);

  const filters: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: 'all', label: 'All', count: counts.total },
    { key: 'active', label: 'Active', count: counts.active },
    { key: 'inactive', label: 'Hidden', count: counts.inactive },
  ];

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 820 }}>
      <div>
        <Link
          to="/shop/master"
          style={{
            fontSize: 14,
            color: '#163a47',
            fontWeight: 600,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <ArrowLeft size={16} /> Master Files
        </Link>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: '#E4EEF1',
              color: '#163a47',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Icon size={20} />
          </div>
          <div>
            <h1 style={{ margin: 0 }}>{meta.title}</h1>
            <p style={{ margin: '4px 0 0', color: '#6b7280' }}>{meta.blurb}</p>
          </div>
        </div>
      </div>

      <Card>
        <h3 style={{ marginTop: 0, marginBottom: 4 }}>Add new</h3>
        <p style={{ margin: '0 0 14px', color: '#6b7280', fontSize: 13 }}>
          Saved values appear in product and books pickers.
        </p>
        <div
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: kind === 'tax_rate' ? '1fr 120px auto' : '1fr auto',
            alignItems: 'end',
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
              {kind === 'tax_rate' ? 'Label' : 'Name'}
            </span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={meta.placeholder}
              style={fieldStyle}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && label.trim() && !createMutation.isPending) {
                  createMutation.mutate();
                }
              }}
            />
          </label>
          {kind === 'tax_rate' ? (
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Rate %</span>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="18"
                style={fieldStyle}
              />
            </label>
          ) : null}
          <Button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!label.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Values{counts.total ? ` · ${counts.total}` : ''}</h3>
        </div>

        {rows.length > 0 ? (
          <div style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name"
              style={fieldStyle}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {filters.map((item) => {
                const on = filter === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setFilter(item.key)}
                    style={{
                      border: 'none',
                      cursor: 'pointer',
                      padding: '7px 12px',
                      borderRadius: 999,
                      fontWeight: 600,
                      fontSize: 13,
                      background: on ? '#163a47' : '#F0F2F7',
                      color: on ? '#fff' : '#0F1623',
                    }}
                  >
                    {item.label}
                    {item.count ? ` ${item.count}` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {listQuery.isLoading ? <p style={{ color: '#6b7280' }}>Loading…</p> : null}
        {!listQuery.isLoading && !rows.length ? (
          <p style={{ color: '#6b7280', margin: 0 }}>Nothing here yet. Add your first value above.</p>
        ) : null}
        {!listQuery.isLoading && rows.length > 0 && !visible.length ? (
          <p style={{ color: '#6b7280', margin: 0 }}>No matches for this search or filter.</p>
        ) : null}

        <div style={{ display: 'grid', gap: 0 }}>
          {visible.map((row) => (
            <div
              key={row.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px 0',
                borderBottom: '1px solid #f3f4f6',
                opacity: row.is_active ? 1 : 0.7,
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: row.is_active ? '#E4EEF1' : '#F0F2F7',
                    color: '#163a47',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  {row.is_active ? <Icon size={15} /> : <EyeOff size={15} />}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 650 }}>{row.label}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    {kind === 'tax_rate' && row.value
                      ? `${row.value}%`
                      : row.is_active
                        ? 'Active'
                        : 'Hidden from pickers'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Button
                  type="button"
                  variant="neutral"
                  onClick={() => patchMutation.mutate(row)}
                  disabled={patchMutation.isPending}
                  title={row.is_active ? 'Hide from pickers' : 'Show in pickers'}
                >
                  {row.is_active ? <EyeOff size={15} /> : <Eye size={15} />}
                  <span style={{ marginLeft: 6 }}>{row.is_active ? 'Hide' : 'Show'}</span>
                </Button>
                <Button
                  type="button"
                  variant="neutral"
                  onClick={() => {
                    if (window.confirm(`Delete “${row.label}”? You can add it again later.`)) {
                      deleteMutation.mutate(row);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  title="Delete"
                >
                  <Trash2 size={15} />
                  <span style={{ marginLeft: 6 }}>Delete</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
