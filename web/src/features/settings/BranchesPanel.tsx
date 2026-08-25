import { useMemo, useState, type FormEvent } from 'react';
import { MapPin } from 'lucide-react';
import type { Branch } from '@ie-orbit/sdk';
import { AddressMapPreview } from '../../components/AddressMapPreview';
import { AddressLocationPicker } from '../../components/AddressLocationPicker';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useBranchesQuery, useCreateBranch, useUpdateBranch } from './branchesHooks';

const INPUT_STYLE = {
  padding: 12,
  borderRadius: 12,
  border: '1px solid #e5e7eb',
  background: '#fff',
} as const;

type StatusFilter = 'all' | 'active' | 'inactive';

function isActive(branch: Branch) {
  return (branch.status ?? 'active') === 'active';
}

export function BranchesPanel() {
  const workspace = useWorkspace();
  const branchesQuery = useBranchesQuery();
  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch();
  const snackbar = useSnackbar();
  const dialog = useDialog();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [branchName, setBranchName] = useState('');
  const [address, setAddress] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  const branches = branchesQuery.data ?? [];
  const activeCount = branches.filter(isActive).length;

  const visibleBranches = useMemo(() => {
    const term = search.trim().toLowerCase();
    return branches.filter((branch) => {
      if (statusFilter === 'active' && !isActive(branch)) return false;
      if (statusFilter === 'inactive' && isActive(branch)) return false;
      if (!term) return true;
      const haystack = [
        branch.display_name,
        branch.branch_name,
        branch.address_line1,
        branch.city,
        branch.state,
        branch.postal_code,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [branches, search, statusFilter]);

  if (!workspace.businessId) {
    return null;
  }

  function resetForm() {
    setEditingId(null);
    setBranchName('');
    setAddress('');
    setAddressLine1('');
    setCity('');
    setState('');
    setCountry('');
    setPostalCode('');
    setPhoneNumber('');
    setLatitude(null);
    setLongitude(null);
  }

  function openCreate() {
    resetForm();
    dialog.show();
  }

  function closeForm() {
    resetForm();
    dialog.hide();
  }

  function openEdit(branch: Branch) {
    setEditingId(branch.id);
    setBranchName(branch.display_name || branch.branch_name || '');
    const composed = [branch.address_line1, branch.city, branch.state, branch.country]
      .filter(Boolean)
      .join(', ');
    setAddress(composed);
    setAddressLine1(branch.address_line1 ?? '');
    setCity(branch.city ?? '');
    setState(branch.state ?? '');
    setCountry(branch.country ?? '');
    setPostalCode(branch.postal_code ?? '');
    setPhoneNumber(branch.phone_number ?? '');
    setLatitude(branch.latitude != null ? Number(branch.latitude) : null);
    setLongitude(branch.longitude != null ? Number(branch.longitude) : null);
    dialog.show();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!branchName.trim()) {
      snackbar.push('Office name is required.', 'warning');
      return;
    }
    if (!addressLine1.trim() || !city.trim() || !country.trim()) {
      snackbar.push('Select a full office address from Google Places.', 'warning');
      return;
    }
    if (latitude == null || longitude == null) {
      snackbar.push('Google Map location is required.', 'warning');
      return;
    }

    const payload = {
      branch_name: branchName.trim(),
      display_name: branchName.trim(),
      address_line1: addressLine1.trim(),
      city: city.trim(),
      state: state.trim() || undefined,
      country: country.trim(),
      postal_code: postalCode.trim() || undefined,
      phone_number: phoneNumber.trim() || undefined,
      latitude,
      longitude,
    };

    try {
      if (editingId) {
        await updateBranch.mutateAsync({ branchId: editingId, branch: payload });
        snackbar.push('Office updated.', 'success');
      } else {
        await createBranch.mutateAsync({ ...payload, is_primary: branches.length === 0 });
        snackbar.push('Office created successfully.', 'success');
      }
      closeForm();
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : 'Unable to save office.', 'error');
    }
  }

  async function handleSetPrimary(branchId: string) {
    try {
      await updateBranch.mutateAsync({ branchId, branch: { is_primary: true } });
      snackbar.push('Primary office updated.', 'success');
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : 'Unable to update office.', 'error');
    }
  }

  async function handleToggleStatus(branch: Branch) {
    const deactivating = isActive(branch);
    if (deactivating && activeCount <= 1) {
      snackbar.push('At least one active office is required.', 'warning');
      return;
    }
    try {
      await updateBranch.mutateAsync({
        branchId: branch.id,
        branch: { status: deactivating ? 'inactive' : 'active' },
      });
      snackbar.push(deactivating ? 'Office deactivated.' : 'Office reactivated.', 'success');
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : 'Unable to update office.', 'error');
    }
  }

  const saving = createBranch.isPending || updateBranch.isPending;

  return (
    <Card style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <p
            style={{
              margin: 0,
              color: '#10b981',
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              fontSize: 12,
            }}
          >
            Locations
          </p>
          <h2 style={{ margin: '8px 0 0', fontSize: 20 }}>Offices</h2>
          <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
            At least one office is required. Each office needs a full address and Google Map pin — it is used for
            customer directions, stock availability, and instant delivery pickup.
          </p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          Add office
        </Button>
      </div>

      <div
        style={{
          marginTop: 20,
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, city or postal code"
          style={{ ...INPUT_STYLE, flex: '1 1 240px' }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {(['active', 'inactive', 'all'] as StatusFilter[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setStatusFilter(option)}
              style={{
                padding: '10px 14px',
                borderRadius: 999,
                border: statusFilter === option ? '1px solid #1a56db' : '1px solid #e5e7eb',
                background: statusFilter === option ? '#eef2ff' : '#fff',
                color: statusFilter === option ? '#1a56db' : '#6b7280',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        {branchesQuery.isLoading ? <p>Loading offices…</p> : null}
        {branchesQuery.error ? <p style={{ color: '#dc2626' }}>{branchesQuery.error.message}</p> : null}
        {!branchesQuery.isLoading && !branchesQuery.error && branches.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No offices yet. Add your first office with address and map pin.</p>
        ) : null}
        {!branchesQuery.isLoading && branches.length > 0 && visibleBranches.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No offices match this search.</p>
        ) : null}
        {visibleBranches.map((branch) => {
          const lat = branch.latitude != null ? Number(branch.latitude) : null;
          const lng = branch.longitude != null ? Number(branch.longitude) : null;
          const active = isActive(branch);
          return (
            <div
              key={branch.id}
              style={{
                display: 'grid',
                gap: 12,
                padding: 14,
                borderRadius: 12,
                border: branch.is_primary ? '1px solid #1a56db' : '1px solid #e5e7eb',
                background: branch.is_primary ? '#eef2ff' : '#fff',
                opacity: active ? 1 : 0.65,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      display: 'grid',
                      placeItems: 'center',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                    }}
                  >
                    <MapPin size={18} />
                  </div>
                  <div>
                    <strong>{branch.display_name ?? branch.branch_name}</strong>
                    {!active ? (
                      <span
                        style={{
                          marginLeft: 8,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: '#f3f4f6',
                          color: '#6b7280',
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        Inactive
                      </span>
                    ) : null}
                    <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
                      {[branch.address_line1, branch.city, branch.state, branch.country].filter(Boolean).join(', ') ||
                        'No address set'}
                      {branch.is_primary ? ' · Primary' : ''}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button variant="ghost" onClick={() => openEdit(branch)}>
                    Edit
                  </Button>
                  {!branch.is_primary && active ? (
                    <Button variant="ghost" onClick={() => handleSetPrimary(branch.id)} disabled={updateBranch.isPending}>
                      Set as primary
                    </Button>
                  ) : null}
                  {branch.is_primary ? (
                    <span style={{ color: '#1a56db', fontWeight: 600, fontSize: 13 }}>Primary</span>
                  ) : (
                    <Button variant="ghost" onClick={() => handleToggleStatus(branch)} disabled={updateBranch.isPending}>
                      {active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  )}
                </div>
              </div>
              <AddressMapPreview latitude={lat} longitude={lng} height={140} />
            </div>
          );
        })}
      </div>

      <Dialog
        open={dialog.open}
        onClose={closeForm}
        title={editingId ? 'Edit office' : 'Add office'}
        labelledBy="office-dialog"
        busy={saving}
      >
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
            Each office needs a full address and a Google Map pin. The pin drives customer
            directions, per-office stock, and instant delivery pickup.
          </p>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Office name</span>
            <input
              value={branchName}
              onChange={(event) => setBranchName(event.target.value)}
              placeholder="Downtown clinic"
              style={INPUT_STYLE}
            />
          </label>

          <AddressLocationPicker
            label="Office address (Google Maps)"
            value={address}
            latitude={latitude}
            longitude={longitude}
            onChangeText={setAddress}
            onPlaceSelected={(place) => {
              setAddress(place.formattedAddress);
              setAddressLine1(place.line1 || place.formattedAddress);
              setCity(place.city || '');
              setState(place.state || '');
              setCountry(place.country || '');
              setPostalCode(place.postalCode || '');
              setLatitude(place.latitude ?? null);
              setLongitude(place.longitude ?? null);
            }}
          />

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
            {(
              [
                ['City', city, setCity],
                ['State', state, setState],
                ['Country', country, setCountry],
                ['Postal code', postalCode, setPostalCode],
                ['Phone (rider contact)', phoneNumber, setPhoneNumber],
              ] as const
            ).map(([label, value, setValue]) => (
              <label key={label} style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{label}</span>
                <input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  style={INPUT_STYLE}
                />
              </label>
            ))}
          </div>

          {latitude != null && longitude != null ? (
            <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>
              Map pin: {latitude.toFixed(6)}, {longitude.toFixed(6)}
            </p>
          ) : (
            <p style={{ margin: 0, color: '#b45309', fontSize: 13 }}>
              Select an address from Google Places so a map pin is saved.
            </p>
          )}

          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Update office' : 'Save office'}
            </Button>
            <Button type="button" variant="neutral" onClick={closeForm} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}
