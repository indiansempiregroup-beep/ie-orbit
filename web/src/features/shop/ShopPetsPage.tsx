import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useShopPets, useShopSettings, useShopSettingsMutations, useShopPetMutations } from './shopHooks';
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { ShopFilterBar } from './ShopFilterBar';

export function ShopPetsPage() {
  const settings = useShopSettings();
  const pets = useShopPets();
  const { patchSettings } = useShopSettingsMutations();
  const { createPet } = useShopPetMutations();
  const dialog = useDialog();
  const client = useApiClient();
  const workspace = useWorkspace();
  const customers = useQuery({
    queryKey: ['customers', workspace.businessId],
    enabled: Boolean(workspace.businessId),
    queryFn: async () => {
      const response = await client.customers.list({
        business: workspace.businessId ?? undefined,
      });
      return response.data;
    },
  });

  const petsEnabled = Boolean(settings.data?.pets_enabled);
  const [customerId, setCustomerId] = useState('');
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('Dog');
  const [breed, setBreed] = useState('');
  const [birthday, setBirthday] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (pets.data ?? []).filter((pet) => {
      if (speciesFilter && (pet.species || '').toLowerCase() !== speciesFilter.toLowerCase()) {
        return false;
      }
      if (customerFilter && pet.customer !== customerFilter) return false;
      if (!term) return true;
      return [pet.name, pet.species ?? '', pet.breed ?? '', pet.medical_notes ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [pets.data, search, speciesFilter, customerFilter]);

  const speciesOptions = useMemo(() => {
    const set = new Set(
      (pets.data ?? [])
        .map((pet) => (pet.species || '').trim())
        .filter(Boolean),
    );
    return Array.from(set).sort();
  }, [pets.data]);

  async function togglePets() {
    setMessage(null);
    try {
      await patchSettings.mutateAsync({ enable_pets: !petsEnabled });
      setMessage(petsEnabled ? 'Pets pack disabled.' : 'Pets pack enabled.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update settings.');
    }
  }

  function openAddDialog() {
    setCustomerId('');
    setName('');
    setSpecies('Dog');
    setBreed('');
    setBirthday('');
    setMedicalNotes('');
    setMessage(null);
    dialog.show();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!customerId || !name.trim()) return;
    setMessage(null);
    try {
      await createPet.mutateAsync({
        customer_id: customerId,
        name: name.trim(),
        species,
        breed,
        birthday: birthday || null,
        medical_notes: medicalNotes,
      });
      dialog.hide();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save pet.');
    }
  }

  return (
    <div className="page-stack">
      {!petsEnabled ? (
        <Card>
          <p>Enable the Pets pack to manage pet profiles for this business.</p>
          <Button type="button" variant="primary" onClick={togglePets} disabled={patchSettings.isPending}>
            Enable Pets pack
          </Button>
          {message ? <p role="status">{message}</p> : null}
        </Card>
      ) : (
        <Card>
          <ShopFilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search pet name, breed, notes…"
            onClear={() => {
              setSearch('');
              setSpeciesFilter('');
              setCustomerFilter('');
            }}
            action={
              <Button type="button" variant="primary" onClick={openAddDialog}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={16} aria-hidden="true" />
                  Add pet
                </span>
              </Button>
            }
            filters={[
              {
                id: 'species',
                label: 'Species',
                value: speciesFilter,
                onChange: setSpeciesFilter,
                options: [
                  { value: '', label: 'All species' },
                  ...speciesOptions.map((value) => ({ value, label: value })),
                ],
              },
              {
                id: 'customer',
                label: 'Customer',
                value: customerFilter,
                onChange: setCustomerFilter,
                options: [
                  { value: '', label: 'All customers' },
                  ...(customers.data ?? []).map((customer) => ({
                    value: customer.id,
                    label: customer.full_name ?? customer.email ?? customer.id,
                  })),
                ],
              },
            ]}
          />
          <div style={{ display: 'grid', gap: 8 }}>
            {filtered.map((pet) => (
              <div key={pet.id}>
                <strong>{pet.name}</strong> · {pet.species || '—'}{' '}
                {pet.breed ? `· ${pet.breed}` : ''}
                {pet.birthday ? ` · birthday ${pet.birthday}` : ''}
                {pet.medical_notes ? <div style={{ opacity: 0.8 }}>{pet.medical_notes}</div> : null}
              </div>
            ))}
            {!pets.data?.length ? <p>No pets yet.</p> : null}
            {pets.data?.length && !filtered.length ? <p>No pets match these filters.</p> : null}
          </div>
        </Card>
      )}

      <Dialog
        open={dialog.open}
        onClose={dialog.hide}
        title="Add pet"
        labelledBy="add-pet-dialog"
        busy={createPet.isPending}
      >
        <form onSubmit={submit} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <label style={{ display: 'grid', gap: 8 }}>
            Customer
            <select
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              required
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            >
              <option value="">Select customer…</option>
              {(customers.data ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.full_name ?? customer.email ?? customer.id}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Pet name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Species
            <input
              value={species}
              onChange={(event) => setSpecies(event.target.value)}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Breed
            <input
              value={breed}
              onChange={(event) => setBreed(event.target.value)}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Birthday
            <input
              type="date"
              value={birthday}
              onChange={(event) => setBirthday(event.target.value)}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Medical notes
            <textarea
              value={medicalNotes}
              onChange={(event) => setMedicalNotes(event.target.value)}
              rows={3}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </label>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={createPet.isPending}>
              {createPet.isPending ? 'Saving…' : 'Save pet'}
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide} disabled={createPet.isPending}>
              Cancel
            </Button>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </form>
      </Dialog>
    </div>
  );
}
