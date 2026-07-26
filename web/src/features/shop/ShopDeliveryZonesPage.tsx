import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useShopDeliveryZones, useShopDeliveryZoneMutations } from './shopHooks';
import { ShopFilterBar } from './ShopFilterBar';

export function ShopDeliveryZonesPage() {
  const zones = useShopDeliveryZones();
  const { createZone, patchZone } = useShopDeliveryZoneMutations();
  const dialog = useDialog();
  const [name, setName] = useState('Nashik city');
  const [cities, setCities] = useState('Nashik, Nasik');
  const [prefixes, setPrefixes] = useState('422');
  const [fee, setFee] = useState('0');
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

  function openAddDialog() {
    setName('Nashik city');
    setCities('Nashik, Nasik');
    setPrefixes('422');
    setFee('0');
    setMessage(null);
    dialog.show();
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      await createZone.mutateAsync({
        name,
        cities: cities
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        postal_prefixes: prefixes
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        fee,
        same_day: true,
        enabled: true,
      });
      dialog.hide();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save zone.');
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
        <div style={{ display: 'grid', gap: 12 }}>
          {filtered.map((zone) => (
            <div key={zone.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <strong>{zone.name}</strong>
                <div style={{ opacity: 0.8 }}>
                  {(zone.cities ?? []).join(', ') || 'Any city'} · prefixes{' '}
                  {(zone.postal_prefixes ?? []).join(', ') || 'any'} · fee {zone.fee}
                </div>
              </div>
              <Button
                type="button"
                onClick={() => patchZone.mutate({ zoneId: zone.id, body: { enabled: !zone.enabled } })}
              >
                {zone.enabled ? 'Disable' : 'Enable'}
              </Button>
            </div>
          ))}
          {!zones.data?.length ? <p>No zones yet. Add one for delivery checkout.</p> : null}
          {zones.data?.length && !filtered.length ? <p>No zones match these filters.</p> : null}
        </div>
      </Card>

      <Dialog
        open={dialog.open}
        onClose={dialog.hide}
        title="Add delivery zone"
        labelledBy="add-zone-dialog"
        busy={createZone.isPending}
      >
        <form onSubmit={create} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <label style={{ display: 'grid', gap: 8 }}>
            Zone name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Cities (comma-separated)
            <input
              value={cities}
              onChange={(event) => setCities(event.target.value)}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Postal prefixes (comma-separated)
            <input
              value={prefixes}
              onChange={(event) => setPrefixes(event.target.value)}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Delivery fee
            <input
              value={fee}
              onChange={(event) => setFee(event.target.value)}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </label>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={createZone.isPending}>
              {createZone.isPending ? 'Saving…' : 'Save zone'}
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide} disabled={createZone.isPending}>
              Cancel
            </Button>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </form>
      </Dialog>
    </div>
  );
}
