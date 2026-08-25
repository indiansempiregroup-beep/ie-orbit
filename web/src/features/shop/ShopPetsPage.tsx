import React, { useEffect, useMemo, useState } from 'react';
import { Heart, Pencil, Plus } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type { ShopPet } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useAuth } from '../../hooks/useAuth';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useShopPets, useShopPetMutations } from './shopHooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { ShopFilterBar } from './ShopFilterBar';
import { hasPetsPack, PETS_PACK_PRICE_INR } from '../../config/products';
import { useBusinessBillingSnapshotQuery, useUpdateBusinessAddonsMutation } from '../settings/billingHooks';
import { getApiErrorMessage } from '../../lib/apiClient';
import { resolveMediaAssetUrl, toStoredMediaAssetUrl } from '../../lib/mediaUrl';
import { uploadPetImage } from './uploadProductImage';

const SPECIES = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Other'];
const SEX_OPTIONS = ['Male', 'Female', 'Unknown'];

const emptyForm = {
  customerId: '',
  name: '',
  species: 'Dog',
  breed: '',
  sex: '',
  birthday: '',
  photoUrl: '',
  medicalNotes: '',
};

type FormState = typeof emptyForm;

const fieldLabel: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#374151' };
const fieldInput: React.CSSProperties = { padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' };

function formFromPet(pet: ShopPet): FormState {
  return {
    customerId: pet.customer || '',
    name: pet.name || '',
    species: pet.species || 'Dog',
    breed: pet.breed || '',
    sex: pet.sex || '',
    birthday: pet.birthday ? String(pet.birthday).slice(0, 10) : '',
    photoUrl: pet.photo_url || '',
    medicalNotes: pet.medical_notes || '',
  };
}

export function ShopPetsPage() {
  const pets = useShopPets();
  const { createPet, patchPet, deletePet, notifyPetOwner } = useShopPetMutations();
  const dialog = useDialog();
  const notifyDialog = useDialog();
  const auth = useAuth();
  const snackbar = useSnackbar();
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

  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
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
      return [pet.name, pet.species ?? '', pet.breed ?? '', pet.customer_name ?? '', pet.medical_notes ?? '']
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

  const customerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const customer of customers.data ?? []) {
      map.set(customer.id, customer.full_name ?? customer.email ?? customer.id);
    }
    return map;
  }, [customers.data]);

  const saving = createPet.isPending || patchPet.isPending || deletePet.isPending || uploading;

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
      snackbar.push(`Pets pack subscribed · ₹${petsPriceInr}/month`, 'success');
    } catch (error) {
      const text = getApiErrorMessage(error, 'Unable to subscribe to Pets pack.');
      setMessage(text);
      snackbar.push(text, 'error');
    }
  }

  function openAddDialog() {
    setEditingId(null);
    setForm(emptyForm);
    setMessage(null);
    dialog.show();
  }

  function openEditDialog(pet: ShopPet) {
    setEditingId(pet.id);
    setForm(formFromPet(pet));
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

  async function uploadPhoto(file: File | null) {
    if (!file || !auth.token || !workspace.tenantId || !workspace.businessId) return;
    setUploading(true);
    setMessage(null);
    try {
      const url = await uploadPetImage({
        accessToken: auth.token,
        tenantId: workspace.tenantId,
        businessId: workspace.businessId,
        imageFile: file,
        petName: form.name || 'Pet',
      });
      const stored = toStoredMediaAssetUrl(url) || url;
      setForm((current) => ({ ...current, photoUrl: stored }));
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Photo upload failed.';
      setMessage(text);
      snackbar.push(text, 'error');
    } finally {
      setUploading(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.customerId || !form.name.trim()) return;
    setMessage(null);
    const payload = {
      customer_id: form.customerId,
      name: form.name.trim(),
      species: form.species,
      breed: form.breed,
      sex: form.sex,
      birthday: form.birthday || null,
      photo_url: form.photoUrl,
      medical_notes: form.medicalNotes,
    };
    try {
      if (editingId) {
        await patchPet.mutateAsync({ petId: editingId, body: payload });
        dialog.hide();
        window.setTimeout(() => snackbar.push('Pet updated.', 'success'), 0);
      } else {
        await createPet.mutateAsync(payload);
        dialog.hide();
        window.setTimeout(() => snackbar.push('Pet saved.', 'success'), 0);
      }
      setForm(emptyForm);
      setEditingId(null);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unable to save pet.';
      setMessage(text);
      snackbar.push(text, 'error');
    }
  }

  async function handleDelete() {
    if (!editingId) return;
    if (!window.confirm(`Delete ${form.name || 'this pet'}?`)) return;
    setMessage(null);
    try {
      await deletePet.mutateAsync(editingId);
      dialog.hide();
      window.setTimeout(() => snackbar.push('Pet deleted.', 'success'), 0);
      setForm(emptyForm);
      setEditingId(null);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unable to delete pet.';
      setMessage(text);
      snackbar.push(text, 'error');
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
      closeNotify();
      snackbar.push(`Notification sent to owner of ${selectedPet.name} (${channels}).`, 'success');
    } catch (error) {
      setNotifyMessage(getApiErrorMessage(error, 'Unable to notify owner.'));
    }
  }

  const photoSrc = resolveMediaAssetUrl(form.photoUrl);

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
          {pets.isLoading ? <p>Loading…</p> : null}
          {pets.error ? <p role="alert">{(pets.error as Error).message}</p> : null}
          <div style={{ display: 'grid', gap: 8 }}>
            {filtered.map((pet) => {
              const src = resolveMediaAssetUrl(pet.photo_url);
              const owner = pet.customer_name || customerNameById.get(pet.customer) || '';
              return (
                <div
                  key={pet.id}
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
                    {src ? (
                      <img
                        src={src}
                        alt=""
                        width={56}
                        height={56}
                        style={{
                          objectFit: 'cover',
                          borderRadius: 10,
                          border: '1px solid #e5e7eb',
                          flexShrink: 0,
                          background: '#f3f4f6',
                        }}
                      />
                    ) : (
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
                        <Heart size={20} aria-hidden="true" />
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <strong>{pet.name}</strong>
                      <div style={{ opacity: 0.8 }}>
                        {[pet.species, pet.breed].filter(Boolean).join(' · ') || 'No species'}
                        {pet.birthday ? ` · birthday ${String(pet.birthday).slice(0, 10)}` : ''}
                        {owner ? ` · ${owner}` : ''}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {pet.sex ? `${pet.sex} · ` : ''}
                        {pet.medical_notes || 'No medical notes'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <Button type="button" variant="neutral" onClick={() => openNotify(pet)}>
                      Notify
                    </Button>
                    <Button type="button" variant="neutral" onClick={() => openEditDialog(pet)}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Pencil size={14} aria-hidden="true" />
                        Edit
                      </span>
                    </Button>
                  </div>
                </div>
              );
            })}
            {!pets.isLoading && !filtered.length ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <p>{pets.data?.length ? 'No pets match these filters.' : 'No pets yet.'}</p>
                {!pets.data?.length ? (
                  <Button type="button" variant="primary" onClick={openAddDialog}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Plus size={16} aria-hidden="true" />
                      Add your first pet
                    </span>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>
      )}

      <Dialog
        open={dialog.open}
        onClose={dialog.hide}
        title={editingId ? 'Edit pet' : 'Add pet'}
        labelledBy="pet-dialog"
        busy={saving}
      >
        <form onSubmit={submit} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
            Pet profiles, photos, and birthdays used for owner reminders.
          </p>
          <label style={{ display: 'grid', gap: 8 }}>
            <span style={fieldLabel}>Photo</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => void uploadPhoto(event.target.files?.[0] ?? null)}
            />
            {photoSrc ? (
              <div style={{ display: 'grid', gap: 6, justifyItems: 'start' }}>
                <img
                  src={photoSrc}
                  alt=""
                  width={96}
                  height={96}
                  style={{ objectFit: 'cover', borderRadius: 12, border: '1px solid #e5e7eb' }}
                />
                <Button type="button" variant="neutral" onClick={() => setForm({ ...form, photoUrl: '' })}>
                  Remove
                </Button>
              </div>
            ) : null}
            {uploading ? <span style={{ fontSize: 12 }}>Uploading…</span> : null}
          </label>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
            <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <span style={fieldLabel}>Customer</span>
              <select
                value={form.customerId}
                onChange={(event) => setForm({ ...form, customerId: event.target.value })}
                required
                style={fieldInput}
              >
                <option value="">Select customer…</option>
                {(customers.data ?? []).map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.full_name ?? customer.email ?? customer.id}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>Pet name</span>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>Species</span>
              <select
                value={form.species}
                onChange={(event) => setForm({ ...form, species: event.target.value })}
                style={fieldInput}
              >
                {SPECIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>Breed</span>
              <input
                value={form.breed}
                onChange={(event) => setForm({ ...form, breed: event.target.value })}
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>Sex</span>
              <select
                value={form.sex}
                onChange={(event) => setForm({ ...form, sex: event.target.value })}
                style={fieldInput}
              >
                <option value="">Select…</option>
                {SEX_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>Birthday</span>
              <input
                type="date"
                value={form.birthday}
                onChange={(event) => setForm({ ...form, birthday: event.target.value })}
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <span style={fieldLabel}>Medical notes</span>
              <textarea
                value={form.medicalNotes}
                onChange={(event) => setForm({ ...form, medicalNotes: event.target.value })}
                rows={3}
                style={fieldInput}
              />
            </label>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Update pet' : 'Save pet'}
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide} disabled={saving}>
              Cancel
            </Button>
            {editingId ? (
              <Button type="button" variant="ghost" onClick={() => void handleDelete()} disabled={saving}>
                Delete pet
              </Button>
            ) : null}
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
            <span style={fieldLabel}>Subject</span>
            <input
              value={notifySubject}
              onChange={(event) => setNotifySubject(event.target.value)}
              required
              style={fieldInput}
            />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            <span style={fieldLabel}>Message</span>
            <textarea
              value={notifyBody}
              onChange={(event) => setNotifyBody(event.target.value)}
              required
              rows={4}
              placeholder="Write a custom message for the pet owner…"
              style={fieldInput}
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
