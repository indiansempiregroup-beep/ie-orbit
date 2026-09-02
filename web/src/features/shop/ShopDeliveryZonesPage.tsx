import React, { useMemo, useState } from 'react';
import { MapPin, Pencil, Plus } from 'lucide-react';
import type { ShopDeliveryZone } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useShopDeliveryZones, useShopDeliveryZoneMutations } from './shopHooks';
import { ShopFilterBar } from './ShopFilterBar';

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
  const zones = useShopDeliveryZones();
  const { createZone, patchZone } = useShopDeliveryZoneMutations();
  const dialog = useDialog();
  const snackbar = useSnackbar();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [enabledFilter, setEnabledFilter] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (zones.data ?? []).filter((zone) => {
      if (enabledFilter === 'enabled' && !zone.enabled) return false;
      if (enabledFilter === 'disabled' && zone.enabled) return false;
      if (!term) return true;
      return [
        zone.name,
        ...(zone.cities ?? []),
        ...(zone.postal_prefixes ?? []),
        zone.notes ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [zones.data, search, enabledFilter]);

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
      name: 'Deliver everywhere',
      cities: '',
      prefixes: '',
      fee: '49',
      minOrder: '0',
      notes: 'Catch-all zone for nationwide courier delivery.',
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
        window.setTimeout(() => snackbar.push('Zone updated.', 'success'), 0);
      } else {
        await createZone.mutateAsync(payload);
        dialog.hide();
        window.setTimeout(() => snackbar.push('Zone saved.', 'success'), 0);
      }
      setForm(emptyForm);
      setEditingId(null);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unable to save zone.';
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
          searchPlaceholder="Search zone, city, postal…"
          onClear={() => {
            setSearch('');
            setEnabledFilter('');
          }}
          filters={[
            {
              id: 'enabled',
              label: 'Availability',
              value: enabledFilter,
              onChange: setEnabledFilter,
              options: [
                { value: '', label: 'All zones' },
                { value: 'enabled', label: 'Enabled' },
                { value: 'disabled', label: 'Disabled' },
              ],
            },
          ]}
          action={
            <Button type="button" variant="primary" onClick={openAddDialog}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={16} aria-hidden="true" />
                Add zone
              </span>
            </Button>
          }
        />

        {zones.isLoading ? <p>Loading…</p> : null}
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
                    {zone.enabled ? 'Enabled' : 'Disabled'}
                    {!((zone.cities ?? []).length || (zone.postal_prefixes ?? []).length) ? (
                      <span style={{ color: '#047857', fontWeight: 700 }}> · Covers all addresses</span>
                    ) : null}
                    {zone.same_day ? ' · Same day' : ''}
                    {zone.instant_delivery_enabled ? ' · Deliver now' : ''}
                    {` · ${(zone.cities ?? []).join(', ') || 'Any city'}`}
                    {` · fee ${zone.fee ?? 0}`}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Prefixes {(zone.postal_prefixes ?? []).join(', ') || 'any'}
                    {zone.min_order_total && Number(zone.min_order_total)
                      ? ` · min order ${zone.min_order_total}`
                      : ''}
                    {zone.notes ? ` · ${zone.notes}` : ''}
                  </div>
                </div>
              </div>
              <Button type="button" variant="neutral" onClick={() => openEditDialog(zone)}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Pencil size={14} aria-hidden="true" />
                  Edit
                </span>
              </Button>
            </div>
          ))}
          {!zones.isLoading && !filtered.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <p>
                {zones.data?.length
                  ? 'No zones match these filters.'
                  : 'No zones yet. Add one for delivery checkout.'}
              </p>
              {!zones.data?.length ? (
                <Button type="button" variant="neutral" onClick={createEverywhereZone}>
                  Deliver everywhere (preset)
                </Button>
              ) : null}
              {!zones.data?.length ? (
                <Button type="button" variant="primary" onClick={openAddDialog}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={16} aria-hidden="true" />
                    Add your first zone
                  </span>
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </Card>

      <Dialog
        open={dialog.open}
        onClose={dialog.hide}
        title={editingId ? 'Edit delivery zone' : 'Add delivery zone'}
        labelledBy="zone-dialog"
        busy={saving}
      >
        <form onSubmit={handleSave} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
            Match checkout addresses by city name and/or postal prefix. Leave cities and postal
            prefixes empty to deliver everywhere. Fee is added when the zone matches.
          </p>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
            <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <span style={fieldLabel}>Zone name</span>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
                placeholder="e.g. Nashik city"
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <span style={fieldLabel}>Cities (comma-separated)</span>
              <input
                value={form.cities}
                onChange={(event) => setForm({ ...form, cities: event.target.value })}
                placeholder="Nashik, Nasik"
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <span style={fieldLabel}>Postal prefixes (comma-separated)</span>
              <input
                value={form.prefixes}
                onChange={(event) => setForm({ ...form, prefixes: event.target.value })}
                placeholder="422"
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>Delivery fee</span>
              <input
                value={form.fee}
                onChange={(event) => setForm({ ...form, fee: event.target.value })}
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>Minimum order</span>
              <input
                value={form.minOrder}
                onChange={(event) => setForm({ ...form, minOrder: event.target.value })}
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <span style={fieldLabel}>Notes</span>
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
              Same-day delivery
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={form.instantDelivery}
                onChange={(event) =>
                  setForm({ ...form, instantDelivery: event.target.checked })
                }
              />
              Allow Deliver now
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
              />
              Enabled
            </label>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Update zone' : 'Save zone'}
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide} disabled={saving}>
              Cancel
            </Button>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </form>
      </Dialog>
    </div>
  );
}
