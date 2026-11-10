import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  icon: LucideIcon;
};

const KINDS: KindMeta[] = [
  { kind: 'category', icon: Grid3X3 },
  { kind: 'brand', icon: Tag },
  { kind: 'unit', icon: Package },
  { kind: 'expense_category', icon: TrendingDown },
  { kind: 'income_category', icon: TrendingUp },
  { kind: 'tax_rate', icon: Percent },
  { kind: 'pet_species', icon: Heart },
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
  const { t } = useTranslation();
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>{t('shop.masterFiles.title')}</h1>
        <p style={{ margin: '8px 0 0', color: '#6b7280', maxWidth: 560, lineHeight: 1.5 }}>
          {t('shop.masterFiles.subtitle')}
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
                    <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>{t(`shop.masterFiles.kinds.${item.kind}.title`)}</h3>
                    <p style={{ margin: 0, color: '#6b7280', fontSize: 13, lineHeight: 1.45 }}>{t(`shop.masterFiles.kinds.${item.kind}.blurb`)}</p>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>{t('shop.masterFiles.alsoInShop')}</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { to: '/shop/godowns', label: t('nav.shopGodowns') },
            { to: '/shop/books/cash', label: t('nav.shopCashBank') },
            { to: '/shop/books/parties', label: t('nav.shopParties') },
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
  const { t } = useTranslation();
  const { kind = 'category' } = useParams<{ kind: string }>();
  const knownKind = KINDS.find((item) => item.kind === kind);
  const meta = {
    title: knownKind ? t(`shop.masterFiles.kinds.${kind}.title`) : kind,
    blurb: knownKind ? t(`shop.masterFiles.kinds.${kind}.blurb`) : t('shop.masterFiles.fallbackBlurb'),
    placeholder: knownKind
      ? t(`shop.masterFiles.kinds.${kind}.placeholder`)
      : t('shop.masterFiles.fallbackPlaceholder'),
  };
  const Icon = knownKind?.icon ?? Package;
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
      snackbar.push(t('shop.masterFiles.toastAdded'), 'success');
      await queryClient.invalidateQueries({ queryKey: ['shop-master', kind, businessId] });
      if (kind === 'category') {
        await queryClient.invalidateQueries({ queryKey: ['shop-product-categories', businessId] });
      }
    },
    onError: (error) => snackbar.push(getApiErrorMessage(error, t('shop.masterFiles.errSave')), 'error'),
  });

  const patchMutation = useMutation({
    mutationFn: async (row: ShopMasterRecord) => {
      await client.shop.patchMasterRecord(kind, row.id, { is_active: !row.is_active });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['shop-master', kind, businessId] });
      snackbar.push(t('shop.masterFiles.toastUpdated'), 'success');
    },
    onError: (error) => snackbar.push(getApiErrorMessage(error, t('shop.masterFiles.errSave')), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (row: ShopMasterRecord) => {
      await client.shop.deleteMasterRecord(kind, row.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['shop-master', kind, businessId] });
      snackbar.push(t('shop.masterFiles.toastRemoved'), 'success');
    },
    onError: (error) => snackbar.push(getApiErrorMessage(error, t('shop.masterFiles.errSave')), 'error'),
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
    { key: 'all', label: t('shop.masterFiles.filterAll'), count: counts.total },
    { key: 'active', label: t('common.active'), count: counts.active },
    { key: 'inactive', label: t('shop.masterFiles.filterHidden'), count: counts.inactive },
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
          <ArrowLeft size={16} /> {t('shop.masterFiles.title')}
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
        <h3 style={{ marginTop: 0, marginBottom: 4 }}>{t('shop.masterFiles.addNew')}</h3>
        <p style={{ margin: '0 0 14px', color: '#6b7280', fontSize: 13 }}>
          {t('shop.masterFiles.addNewHint')}
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
              {kind === 'tax_rate' ? t('shop.masterFiles.label') : t('shop.masterFiles.name')}
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
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{t('shop.masterFiles.ratePercent')}</span>
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
            {createMutation.isPending ? t('shop.masterFiles.adding') : t('shop.masterFiles.add')}
          </Button>
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>
            {t('shop.masterFiles.values')}
            {counts.total ? ` · ${counts.total}` : ''}
          </h3>
        </div>

        {rows.length > 0 ? (
          <div style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('shop.masterFiles.filterByName')}
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

        {listQuery.isLoading ? <p style={{ color: '#6b7280' }}>{t('common.loading')}</p> : null}
        {!listQuery.isLoading && !rows.length ? (
          <p style={{ color: '#6b7280', margin: 0 }}>{t('shop.masterFiles.emptyNone')}</p>
        ) : null}
        {!listQuery.isLoading && rows.length > 0 && !visible.length ? (
          <p style={{ color: '#6b7280', margin: 0 }}>{t('shop.masterFiles.emptyFiltered')}</p>
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
                        ? t('common.active')
                        : t('shop.masterFiles.hiddenFromPickers')}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Button
                  type="button"
                  variant="neutral"
                  onClick={() => patchMutation.mutate(row)}
                  disabled={patchMutation.isPending}
                  title={row.is_active ? t('shop.masterFiles.hideFromPickers') : t('shop.masterFiles.showInPickers')}
                >
                  {row.is_active ? <EyeOff size={15} /> : <Eye size={15} />}
                  <span style={{ marginLeft: 6 }}>{row.is_active ? t('shop.masterFiles.hide') : t('shop.masterFiles.show')}</span>
                </Button>
                <Button
                  type="button"
                  variant="neutral"
                  onClick={() => {
                    if (window.confirm(t('shop.masterFiles.confirmDelete', { label: row.label }))) {
                      deleteMutation.mutate(row);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  title={t('shop.masterFiles.delete')}
                >
                  <Trash2 size={15} />
                  <span style={{ marginLeft: 6 }}>{t('shop.masterFiles.delete')}</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
