import { useMemo, useState, type FormEvent } from 'react';
import { MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Branch } from '@ie-orbit/sdk';
import { AddressMapPreview } from '../../components/AddressMapPreview';
import { AddressLocationPicker } from '../../components/AddressLocationPicker';
import { placesCountryCodeFromName } from '../../lib/placesCountryCode';
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

const STATUS_FILTER_KEYS: Record<StatusFilter, string> = {
  active: 'settings.branches.filterActive',
  inactive: 'settings.branches.filterInactive',
  all: 'settings.branches.filterAll',
};

function isActive(branch: Branch) {
  return (branch.status ?? 'active') === 'active';
}

export function BranchesPanel() {
  const { t } = useTranslation();
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
  const [addressLine2, setAddressLine2] = useState('');
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
    setAddressLine2('');
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
    setAddressLine2(branch.address_line2 ?? '');
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
      snackbar.push(t('settings.branches.nameRequired'), 'warning');
      return;
    }
    if (!addressLine1.trim() || !city.trim() || !country.trim()) {
      snackbar.push(t('settings.branches.addressRequired'), 'warning');
      return;
    }
    if (latitude == null || longitude == null) {
      snackbar.push(t('settings.branches.mapRequired'), 'warning');
      return;
    }

    const payload = {
      branch_name: branchName.trim(),
      display_name: branchName.trim(),
      address_line1: addressLine1.trim(),
      address_line2: addressLine2.trim() || undefined,
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
        snackbar.push(t('settings.branches.saved'), 'success');
      } else {
        await createBranch.mutateAsync({ ...payload, is_primary: branches.length === 0 });
        snackbar.push(t('settings.branches.added'), 'success');
      }
      closeForm();
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : t('settings.branches.saveFailed'), 'error');
    }
  }

  async function handleSetPrimary(branchId: string) {
    try {
      await updateBranch.mutateAsync({ branchId, branch: { is_primary: true } });
      snackbar.push(t('settings.branches.primaryUpdated'), 'success');
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : t('settings.branches.updateFailed'), 'error');
    }
  }

  async function handleToggleStatus(branch: Branch) {
    const deactivating = isActive(branch);
    if (deactivating && activeCount <= 1) {
      snackbar.push(t('settings.branches.minOneActive'), 'warning');
      return;
    }
    try {
      await updateBranch.mutateAsync({
        branchId: branch.id,
        branch: { status: deactivating ? 'inactive' : 'active' },
      });
      snackbar.push(deactivating ? t('settings.branches.deactivated') : t('settings.branches.reactivated'), 'success');
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : t('settings.branches.updateFailed'), 'error');
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
            {t('settings.branches.kicker')}
          </p>
          <h2 style={{ margin: '8px 0 0', fontSize: 20 }}>{t('settings.branches.title')}</h2>
          <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
            {t('settings.branches.lead')}
          </p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          {t('settings.branches.addOffice')}
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
          placeholder={t('settings.branches.searchPlaceholder')}
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
              {t(STATUS_FILTER_KEYS[option])}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        {branchesQuery.isLoading ? <p>{t('settings.branches.loading')}</p> : null}
        {branchesQuery.error ? <p style={{ color: '#dc2626' }}>{branchesQuery.error.message}</p> : null}
        {!branchesQuery.isLoading && !branchesQuery.error && branches.length === 0 ? (
          <p style={{ color: '#6b7280' }}>{t('settings.branches.empty')}</p>
        ) : null}
        {!branchesQuery.isLoading && branches.length > 0 && visibleBranches.length === 0 ? (
          <p style={{ color: '#6b7280' }}>{t('settings.branches.noMatch')}</p>
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
                        {t('settings.branches.inactiveBadge')}
                      </span>
                    ) : null}
                    <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
                      {[branch.address_line1, branch.city, branch.state, branch.country].filter(Boolean).join(', ') ||
                        t('settings.branches.noAddress')}
                      {branch.is_primary ? ` · ${t('settings.branches.primary')}` : ''}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button variant="ghost" onClick={() => openEdit(branch)}>
                    {t('settings.branches.edit')}
                  </Button>
                  {!branch.is_primary && active ? (
                    <Button variant="ghost" onClick={() => handleSetPrimary(branch.id)} disabled={updateBranch.isPending}>
                      {t('settings.branches.setPrimary')}
                    </Button>
                  ) : null}
                  {branch.is_primary ? (
                    <span style={{ color: '#1a56db', fontWeight: 600, fontSize: 13 }}>{t('settings.branches.primary')}</span>
                  ) : (
                    <Button variant="ghost" onClick={() => handleToggleStatus(branch)} disabled={updateBranch.isPending}>
                      {active ? t('settings.branches.deactivate') : t('settings.branches.reactivate')}
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
        title={editingId ? t('settings.branches.editTitle') : t('settings.branches.addOffice')}
        labelledBy="office-dialog"
        busy={saving}
      >
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
            {t('settings.branches.dialogLead')}
          </p>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{t('settings.branches.nameLabel')}</span>
            <input
              value={branchName}
              onChange={(event) => setBranchName(event.target.value)}
              placeholder={t('settings.branches.namePlaceholder')}
              style={INPUT_STYLE}
            />
          </label>

          <AddressLocationPicker
            label={t('settings.branches.addressLabel')}
            value={address}
            latitude={latitude}
            longitude={longitude}
            countryCode={placesCountryCodeFromName(country)}
            onChangeText={setAddress}
            onPlaceSelected={(place) => {
              const cleared =
                !place.line1 &&
                !place.formattedAddress &&
                place.latitude == null &&
                place.longitude == null;
              setAddress(place.formattedAddress);
              setAddressLine1(place.line1 || place.formattedAddress);
              setAddressLine2((current) => (cleared ? '' : current));
              setCity(place.city || '');
              setState(place.state || '');
              setCountry(place.country || '');
              setPostalCode(place.postalCode || '');
              setLatitude(place.latitude ?? null);
              setLongitude(place.longitude ?? null);
            }}
          />

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
              {t('settings.branches.line2Label')}
            </span>
            <input
              value={addressLine2}
              onChange={(event) => setAddressLine2(event.target.value)}
              placeholder={t('settings.branches.line2Placeholder')}
              style={INPUT_STYLE}
            />
          </label>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
            {(
              [
                ['city', t('settings.businessEdit.city'), city, setCity],
                ['state', t('settings.businessEdit.state'), state, setState],
                ['country', t('settings.businessEdit.country'), country, setCountry],
                ['postalCode', t('settings.businessEdit.postalCode'), postalCode, setPostalCode],
                ['phone', t('settings.branches.phoneRider'), phoneNumber, setPhoneNumber],
              ] as const
            ).map(([fieldId, label, value, setValue]) => {
              const locked = fieldId !== 'phone' && latitude != null && longitude != null;
              return (
              <label key={fieldId} style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{label}</span>
                <input
                  value={value}
                  readOnly={locked}
                  onChange={(event) => setValue(event.target.value)}
                  style={{ ...INPUT_STYLE, background: locked ? '#f9fafb' : INPUT_STYLE.background }}
                />
              </label>
            );
            })}
          </div>

          {latitude != null && longitude != null ? (
            <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>
              {t('settings.branches.mapPin', { lat: latitude.toFixed(6), lng: longitude.toFixed(6) })}
            </p>
          ) : (
            <p style={{ margin: 0, color: '#b45309', fontSize: 13 }}>
              {t('settings.branches.selectAddressHint')}
            </p>
          )}

          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? t('common.saving') : editingId ? t('settings.branches.updateOffice') : t('settings.branches.saveOffice')}
            </Button>
            <Button type="button" variant="neutral" onClick={closeForm} disabled={saving}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}
