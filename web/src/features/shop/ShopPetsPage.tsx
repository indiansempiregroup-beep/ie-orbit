import React, { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type { ShopPet } from '@ie-platform/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useShopPets, useShopPetMutations } from './shopHooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { ShopFilterBar } from './ShopFilterBar';
import { hasPetsPack, PETS_PACK_PRICE_INR } from '../../config/products';
import { useBusinessBillingSnapshotQuery, useUpdateBusinessAddonsMutation } from '../settings/billingHooks';
import { getApiErrorMessage } from '../../lib/apiClient';

export function ShopPetsPage() {
  const pets = useShopPets();
  const { createPet, notifyPetOwner } = useShopPetMutations();
  const dialog = useDialog();
  const notifyDialog = useDialog();
  const client = useApiClient();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const updateAddons = useUpdateBusinessAddonsMutation(workspace.businessId ?? undefined);
  const billingQuery = useBusinessBillingSnapshotQuery(workspace.businessId ?? undefined);
  const petsPriceInr = Math.round(
    (billingQuery.data?.pricing?.addon_pets_unit_paise ?? PETS_PACK_PRICE_INR * 100) / 100,
  );
  const petsSubscribed = hasPetsPack(workspace.activeBusiness?.product_subscriptions);
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
  const [selectedPet, setSelectedPet] = useState<ShopPet | null>(null);
  const [notifySubject, setNotifySubject] = useState('');
  const [notifyBody, setNotifyBody] = useState('');
  const [notifyMessage, setNotifyMessage] = useState<string | null>(null);

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

  useEffect(() => {
    const petId = searchParams.get('petId');
    if (!petId || !pets.data?.length) return;
    const pet = pets.data.find((item) => item.id === petId);
    if (!pet) return;
    setSelectedPet(pet);
    if (searchParams.get('notify') === '1') {
      setNotifySubject(`Happy birthday reminder for ${pet.name}`);
      setNotifyBody('');
      setNotifyMessage(null);
      notifyDialog.show();
    }
    // Intentionally depend on show callback + query params/data only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pets.data, searchParams, notifyDialog.show]);

  async function subscribePets() {
    setMessage(null);
    const shopie = workspace.activeBusiness?.product_subscriptions?.find(
      (subscription) =>
        subscription.product_code === 'shopie' &&
        (subscription.status === 'active' || subscription.status === 'trialing'),
    );
    if (!shopie) {
      setMessage('Subscribe to ShopIE first, then add the Pets pack.');
      return;
    }
    try {
      await updateAddons.mutateAsync({
        productCode: 'shopie',
        extra_staff: shopie.extra_staff ?? 0,
        extra_offices: shopie.extra_offices ?? 0,
        pets_pack_enabled: true,
      });
      await workspace.refreshWorkspace();
      await queryClient.invalidateQueries({ queryKey: ['shop'] });
      setMessage(`Pets pack subscribed · ₹${petsPriceInr}/month`);
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'Unable to subscribe to Pets pack.'));
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

  function openNotify(pet: ShopPet) {
    setSelectedPet(pet);
    setNotifySubject(`Happy birthday reminder for ${pet.name}`);
    setNotifyBody('');
    setNotifyMessage(null);
    notifyDialog.show();
  }

  function closeNotify() {
    notifyDialog.hide();
    const next = new URLSearchParams(searchParams);
    next.delete('notify');
    next.delete('petId');
    setSearchParams(next, { replace: true });
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

  async function submitNotify(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedPet) return;
    if (!notifySubject.trim() || !notifyBody.trim()) {
      setNotifyMessage('Subject and message are required.');
      return;
    }
    setNotifyMessage(null);
    try {
      const result = await notifyPetOwner.mutateAsync({
        petId: selectedPet.id,
        subject: notifySubject.trim(),
        body: notifyBody.trim(),
      });
      const channels = (result.sent_channels || []).join(', ') || 'none';
      setNotifyMessage(`Notification sent (${channels}).`);
      closeNotify();
      setMessage(`Notification sent to owner of ${selectedPet.name} (${channels}).`);
    } catch (error) {
      setNotifyMessage(getApiErrorMessage(error, 'Unable to notify owner.'));
    }
  }

  return (
    <div className="page-stack">
      {!petsSubscribed ? (
        <Card>
          <p>
            Pets pack manages pet profiles, birthdays, and owner alerts for ₹{petsPriceInr}/month.
          </p>
          <Button
            type="button"
            variant="primary"
            onClick={() => void subscribePets()}
            disabled={updateAddons.isPending}
          >
            {updateAddons.isPending ? 'Subscribing…' : `Subscribe · ₹${petsPriceInr}/mo`}
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
          {message ? <p role="status">{message}</p> : null}
          <div style={{ display: 'grid', gap: 8 }}>
            {filtered.map((pet) => (
              <div
                key={pet.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  alignItems: 'flex-start',
                  padding: 12,
                  borderRadius: 12,
                  border: selectedPet?.id === pet.id ? '1px solid #2563eb' : '1px solid transparent',
                  background: selectedPet?.id === pet.id ? '#eff6ff' : 'transparent',
                }}
              >
                <div>
                  <strong>{pet.name}</strong> · {pet.species || '—'}{' '}
                  {pet.breed ? `· ${pet.breed}` : ''}
                  {pet.birthday ? ` · birthday ${pet.birthday}` : ''}
                  {pet.medical_notes ? <div style={{ opacity: 0.8 }}>{pet.medical_notes}</div> : null}
                </div>
                <Button type="button" variant="neutral" onClick={() => openNotify(pet)}>
                  Notify owner
                </Button>
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

      <Dialog
        open={notifyDialog.open}
        onClose={closeNotify}
        title={selectedPet ? `Notify owner · ${selectedPet.name}` : 'Notify owner'}
        labelledBy="notify-pet-owner-dialog"
        busy={notifyPetOwner.isPending}
      >
        <form onSubmit={(event) => void submitNotify(event)} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          {selectedPet ? (
            <p style={{ margin: 0, color: '#6b7280' }}>
              Birthday: {selectedPet.birthday || 'Not set'} · Species: {selectedPet.species || '—'}
            </p>
          ) : null}
          <label style={{ display: 'grid', gap: 8 }}>
            Subject
            <input
              value={notifySubject}
              onChange={(event) => setNotifySubject(event.target.value)}
              required
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Message
            <textarea
              value={notifyBody}
              onChange={(event) => setNotifyBody(event.target.value)}
              required
              rows={4}
              placeholder="Write a custom message for the pet owner…"
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </label>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>
            Sends in-app (if they have an account) and email.
          </p>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={notifyPetOwner.isPending}>
              {notifyPetOwner.isPending ? 'Sending…' : 'Send notification'}
            </Button>
            <Button type="button" variant="neutral" onClick={closeNotify} disabled={notifyPetOwner.isPending}>
              Cancel
            </Button>
          </div>
          {notifyMessage ? <p role="status">{notifyMessage}</p> : null}
        </form>
      </Dialog>
    </div>
  );
}
