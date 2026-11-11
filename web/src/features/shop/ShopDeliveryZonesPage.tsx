import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Pencil, Plus } from 'lucide-react';
import type { ShopDeliveryZone } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useShopDeliveryZones, useShopDeliveryZoneMutations } from './shopHooks';
import { ShopFilterBar } from './ShopFilterBar';
import { useCursorListState } from '../../hooks/useCursorListState';
import { CursorPager } from '../bi/components/CursorPager';

const emptyForm = {
  name: '',
  cities: '',
  prefixes: '',
  fee: '0',
  minOrder: '0',
  notes: '',
  sameDay: true,
  instantDelivery: false,
  enabled: true,
};

type FormState = typeof emptyForm;

const fieldLabel: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#374151' };
const fieldInput: React.CSSProperties = { padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' };

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function formFromZone(zone: ShopDeliveryZone): FormState {
  return {
    name: zone.name || '',
    cities: (zone.cities ?? []).join(', '),
    prefixes: (zone.postal_prefixes ?? []).join(', '),
    fee: String(zone.fee ?? '0'),
    minOrder: String(zone.min_order_total ?? '0'),
    notes: zone.notes ?? '',
    sameDay: zone.same_day !== false,
    instantDelivery: zone.instant_delivery_enabled === true,
    enabled: zone.enabled !== false,
  };
}

export function ShopDeliveryZonesPage() {
  const { t } = useTranslation();
  const { createZone, patchZone } = useShopDeliveryZoneMutations();
  const dialog = useDialog();
  const snackbar = useSnackbar();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enabledFilter, setEnabledFilter] = useState('');
  const listState = useCursorListState({ resetKey: enabledFilter });
  const { searchTerm: search, setSearchTerm: setSearch } = listState;
  const zones = useShopDeliveryZones({
    q: listState.debouncedSearch,
    enabledFilter: enabledFilter === 'enabled' ? 'true' : enabledFilter === 'disabled' ? 'false' : '',
    pageSize: listState.pageSize,
    cursor: listState.cursor,
  });

  // Server-filtered page (q + enabled).
  const filtered = useMemo(() => zones.data?.items ?? [], [zones.data]);

  const saving = createZone.isPending || patchZone.isPending;

  function openAddDialog() {
    setEditingId(null);
    setForm(emptyForm);
    setMessage(null);
    dialog.show();
  }

  function openEditDialog(zone: ShopDeliveryZone) {
    setEditingId(zone.id);
    setForm(formFromZone(zone));
    setMessage(null);
    dialog.show();
  }

  async function createEverywhereZone() {
    setEditingId(null);
    setForm({
      name: t('shop.deliveryZones.presetName'),
      cities: '',
      prefixes: '',
      fee: '49',
      minOrder: '0',
      notes: t('shop.deliveryZones.presetNotes'),
      sameDay: false,
      instantDelivery: false,
      enabled: true,
    });
    setMessage(null);
    dialog.show();
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setMessage(null);
    const payload = {
      name: form.name.trim(),
      cities: splitCsv(form.cities),
      postal_prefixes: splitCsv(form.prefixes),
      fee: form.fee.trim() || '0',
      min_order_total: form.minOrder.trim() || '0',
      notes: form.notes.trim(),
      same_day: form.sameDay,
      instant_delivery_enabled: form.instantDelivery,
      enabled: form.enabled,
    };
    try {
      if (editingId) {
        await patchZone.mutateAsync({ zoneId: editingId, body: payload });
        dialog.hide();
        window.setTimeout(() => snackbar.push(t('shop.deliveryZones.toastSaved'), 'success'), 0);
      } else {
        await createZone.mutateAsync(payload);
        dialog.hide();
        window.setTimeout(() => snackbar.push(t('shop.deliveryZones.toastAdded'), 'success'), 0);
      }
      setForm(emptyForm);
      setEditingId(null);
    } catch (error) {
      const text = error instanceof Error ? error.message : t('shop.deliveryZones.errSave');
      setMessage(text);
      snackbar.push(text, 'error');
    }
  }

  return (
    <div className="page-stack">
      <Card>
        <ShopFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('shop.deliveryZones.searchPlaceholder')}
          onClear={() => {
            setSearch('');
            setEnabledFilter('');
          }}
          filters={[
            {
              id: 'enabled',
              label: t('shop.deliveryZones.availability'),
              value: enabledFilter,
              onChange: setEnabledFilter,
              options: [
                { value: '', label: t('shop.deliveryZones.allZones') },
                { value: 'enabled', label: t('shop.deliveryZones.enabled') },
                { value: 'disabled', label: t('shop.deliveryZones.disabled') },
              ],
            },
          ]}
          action={
            <Button type="button" variant="primary" onClick={openAddDialog}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={16} aria-hidden="true" />
                {t('shop.deliveryZones.addZone')}
              </span>
            </Button>
          }
        />

        {zones.isLoading ? <p>{t('common.loading')}</p> : null}
        {zones.error ? <p role="alert">{(zones.error as Error).message}</p> : null}
        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map((zone) => (
            <div
              key={zone.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                borderBottom: '1px solid var(--border, #ddd)',
                paddingBottom: 8,
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0 }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 10,
                    border: '1px solid #e5e7eb',
                    background: '#f3f4f6',
                    flexShrink: 0,
                    display: 'grid',
                    placeItems: 'center',
                    color: '#6b7280',
                  }}
                >
                  <MapPin size={20} aria-hidden="true" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <strong>{zone.name}</strong>
                  <div style={{ opacity: 0.8 }}>
                    {zone.enabled ? t('shop.deliveryZones.enabled') : t('shop.deliveryZones.disabled')}
                    {!((zone.cities ?? []).length || (zone.postal_prefixes ?? []).length) ? (
                      <span style={{ color: '#047857', fontWeight: 700 }}> · {t('shop.deliveryZones.coversAll')}</span>
                    ) : null}
                    {zone.same_day ? ` · ${t('shop.deliveryZones.sameDay')}` : ''}
                    {zone.instant_delivery_enabled ? ` · ${t('shop.deliveryZones.deliverNow')}` : ''}
                    {` · ${(zone.cities ?? []).join(', ') || t('shop.deliveryZones.anyCity')}`}
                    {` · ${t('shop.deliveryZones.fee', { amount: zone.fee ?? 0 })}`}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {t('shop.deliveryZones.prefixes', {
                      list: (zone.postal_prefixes ?? []).join(', ') || t('shop.deliveryZones.any'),
                    })}
                    {zone.min_order_total && Number(zone.min_order_total)
                      ? ` · ${t('shop.deliveryZones.minOrderShort', { amount: zone.min_order_total })}`
                      : ''}
                    {zone.notes ? ` · ${zone.notes}` : ''}
                  </div>
                </div>
              </div>
              <Button type="button" variant="neutral" onClick={() => openEditDialog(zone)}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Pencil size={14} aria-hidden="true" />
                  {t('shop.deliveryZones.edit')}
                </span>
              </Button>
            </div>
          ))}
          {!zones.isLoading && !filtered.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <p>
                {search || enabledFilter
                  ? t('shop.deliveryZones.emptyFiltered')
                  : t('shop.deliveryZones.emptyNone')}
              </p>
              {!search && !enabledFilter ? (
                <Button type="button" variant="neutral" onClick={createEverywhereZone}>
                  {t('shop.deliveryZones.presetButton')}
                </Button>
              ) : null}
              {!search && !enabledFilter ? (
                <Button type="button" variant="primary" onClick={openAddDialog}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={16} aria-hidden="true" />
                    {t('shop.deliveryZones.addFirst')}
                  </span>
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <CursorPager
          {...listState.pagerProps(zones.data, filtered.length)}
          label={t('shop.deliveryZones.addDeliveryZone').split(' ').pop()?.toLowerCase() ?? 'zones'}
          disabled={zones.isFetching}
        />
      </Card>

      <Dialog
        open={dialog.open}
        onClose={dialog.hide}
        title={editingId ? t('shop.deliveryZones.editZone') : t('shop.deliveryZones.addDeliveryZone')}
        labelledBy="zone-dialog"
        busy={saving}
      >
        <form onSubmit={handleSave} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
            {t('shop.deliveryZones.dialogHint')}
          </p>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
            <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <span style={fieldLabel}>{t('shop.deliveryZones.zoneName')}</span>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
                placeholder={t('shop.deliveryZones.zoneNamePlaceholder')}
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <span style={fieldLabel}>{t('shop.deliveryZones.cities')}</span>
              <input
                value={form.cities}
                onChange={(event) => setForm({ ...form, cities: event.target.value })}
                placeholder="Nashik, Nasik"
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <span style={fieldLabel}>{t('shop.deliveryZones.postalPrefixes')}</span>
              <input
                value={form.prefixes}
                onChange={(event) => setForm({ ...form, prefixes: event.target.value })}
                placeholder="422"
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>{t('shop.deliveryZones.deliveryFee')}</span>
              <input
                value={form.fee}
                onChange={(event) => setForm({ ...form, fee: event.target.value })}
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>{t('shop.deliveryZones.minimumOrder')}</span>
              <input
                value={form.minOrder}
                onChange={(event) => setForm({ ...form, minOrder: event.target.value })}
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <span style={fieldLabel}>{t('shop.deliveryZones.notes')}</span>
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                rows={3}
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={form.sameDay}
                onChange={(event) => setForm({ ...form, sameDay: event.target.checked })}
              />
              {t('shop.deliveryZones.sameDayDelivery')}
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={form.instantDelivery}
                onChange={(event) =>
                  setForm({ ...form, instantDelivery: event.target.checked })
                }
              />
              {t('shop.deliveryZones.allowDeliverNow')}
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
              />
              {t('shop.deliveryZones.enabled')}
            </label>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? t('common.saving') : editingId ? t('shop.deliveryZones.updateZone') : t('shop.deliveryZones.saveZone')}
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide} disabled={saving}>
              {t('common.cancel')}
            </Button>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </form>
      </Dialog>
    </div>
  );
}
