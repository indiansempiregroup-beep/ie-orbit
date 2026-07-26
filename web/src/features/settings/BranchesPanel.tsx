import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { AddressMapPreview } from '../../components/AddressMapPreview';
import { AddressPlacesField } from '../../components/AddressPlacesField';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useBranchesQuery, useCreateBranch, useUpdateBranch } from './branchesHooks';

export function BranchesPanel() {
  const workspace = useWorkspace();
  const branchesQuery = useBranchesQuery();
  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch();
  const snackbar = useSnackbar();

  const [showForm, setShowForm] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [address, setAddress] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  if (!workspace.businessId) {
    return null;
  }

  function resetForm() {
    setBranchName('');
    setAddress('');
    setAddressLine1('');
    setCity('');
    setState('');
    setCountry('');
    setPostalCode('');
    setLatitude(null);
    setLongitude(null);
  }

  async function handleCreate() {
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

    try {
      await createBranch.mutateAsync({
        branch_name: branchName.trim(),
        display_name: branchName.trim(),
        address_line1: addressLine1.trim(),
        city: city.trim(),
        state: state.trim() || undefined,
        country: country.trim(),
        postal_code: postalCode.trim() || undefined,
        latitude,
        longitude,
        is_primary: (branchesQuery.data?.length ?? 0) === 0,
      });
      resetForm();
      setShowForm(false);
      snackbar.push('Office created successfully.', 'success');
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : 'Unable to create office.', 'error');
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
            At least one office is required. Each office needs a full address and Google Map pin for customer
            directions.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowForm((current) => !current)}>
          {showForm ? 'Cancel' : 'Add office'}
        </Button>
      </div>

      {showForm ? (
        <div
          style={{
            marginTop: 20,
            padding: 16,
            borderRadius: 14,
            border: '1px solid #dbeafe',
            background: '#f8fbff',
            display: 'grid',
            gap: 14,
          }}
        >
          <label style={{ display: 'grid', gap: 8 }}>
            <span style={{ color: '#6b7280', fontSize: 13 }}>Office name</span>
            <input
              value={branchName}
              onChange={(event) => setBranchName(event.target.value)}
              placeholder="Downtown clinic"
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}
            />
          </label>
          <AddressPlacesField
            label="Office address (Google Maps)"
            value={address}
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
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ color: '#6b7280', fontSize: 13 }}>City</span>
              <input
                value={city}
                onChange={(event) => setCity(event.target.value)}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ color: '#6b7280', fontSize: 13 }}>State</span>
              <input
                value={state}
                onChange={(event) => setState(event.target.value)}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ color: '#6b7280', fontSize: 13 }}>Country</span>
              <input
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ color: '#6b7280', fontSize: 13 }}>Postal code</span>
              <input
                value={postalCode}
                onChange={(event) => setPostalCode(event.target.value)}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}
              />
            </label>
          </div>
          <AddressMapPreview latitude={latitude} longitude={longitude} height={180} />
          {latitude != null && longitude != null ? (
            <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>
              Map pin: {latitude.toFixed(6)}, {longitude.toFixed(6)}
            </p>
          ) : (
            <p style={{ margin: 0, color: '#b45309', fontSize: 13 }}>
              Select an address from Google Places so a map pin is saved.
            </p>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" onClick={handleCreate} disabled={createBranch.isPending}>
              {createBranch.isPending ? 'Creating…' : 'Create office'}
            </Button>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
        {branchesQuery.isLoading ? <p>Loading offices…</p> : null}
        {branchesQuery.error ? <p style={{ color: '#dc2626' }}>{branchesQuery.error.message}</p> : null}
        {!branchesQuery.isLoading && !branchesQuery.error && (branchesQuery.data?.length ?? 0) === 0 ? (
          <p style={{ color: '#6b7280' }}>No offices yet. Add your first office with address and map pin.</p>
        ) : null}
        {(branchesQuery.data ?? []).map((branch) => {
          const lat = branch.latitude != null ? Number(branch.latitude) : null;
          const lng = branch.longitude != null ? Number(branch.longitude) : null;
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
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
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
                    <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
                      {[branch.address_line1, branch.city, branch.state, branch.country].filter(Boolean).join(', ') ||
                        'No address set'}
                      {branch.is_primary ? ' · Primary' : ''}
                    </p>
                  </div>
                </div>
                {!branch.is_primary ? (
                  <Button variant="ghost" onClick={() => handleSetPrimary(branch.id)} disabled={updateBranch.isPending}>
                    Set as primary
                  </Button>
                ) : (
                  <span style={{ color: '#1a56db', fontWeight: 600, fontSize: 13 }}>Primary</span>
                )}
              </div>
              <AddressMapPreview latitude={lat} longitude={lng} height={140} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
