import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, Pencil, Plus, Warehouse } from 'lucide-react';
import type { ShopGodown } from '@ie-orbit/sdk';
import { AddressLocationPicker } from '../../components/AddressLocationPicker';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useSnackbar } from '../../hooks/useSnackbar';
import {
  useShopGodowns,
  useShopGodownMutations,
  useShopProducts,
  useShopStockTransfers,
  useShopStockTransferMutations,
} from './shopHooks';
import { ShopFilterBar } from './ShopFilterBar';

const emptyForm = {
  name: '',
  code: '',
  phone: '',
  address: '',
  addressLine2: '',
  city: '',
  state: '',
  country: '',
  postalCode: '',
  latitude: null as number | null,
  longitude: null as number | null,
  isDefault: false,
};

type FormState = typeof emptyForm;

const fieldLabel: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#374151' };
const fieldInput: React.CSSProperties = { padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' };

function asNumber(value: string | number | undefined | null): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatQty(value: string | number | undefined | null): string {
  const n = asNumber(value);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, '');
}

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function formFromGodown(godown: ShopGodown): FormState {
  return {
    name: godown.name || '',
    code: godown.code ?? '',
    phone: godown.phone_number ?? '',
    address: godown.address_line1 ?? '',
    addressLine2: godown.address_line2 ?? '',
    city: godown.city ?? '',
    state: godown.state ?? '',
    country: godown.country ?? '',
    postalCode: godown.postal_code ?? '',
    latitude: godown.latitude == null ? null : Number(godown.latitude),
    longitude: godown.longitude == null ? null : Number(godown.longitude),
    isDefault: Boolean(godown.is_default),
  };
}

function stockedCount(godown: ShopGodown) {
  return (godown.stocks ?? []).filter((row) => asNumber(row.quantity) > 0).length;
}

export function ShopGodownsPage() {
  const { t } = useTranslation();
  const godowns = useShopGodowns();
  const products = useShopProducts('', 'active');
  const transfers = useShopStockTransfers();
  const { createGodown, patchGodown } = useShopGodownMutations();
  const { createTransfer } = useShopStockTransferMutations();
  const dialog = useDialog();
  const transferDialog = useDialog();
  const snackbar = useSnackbar();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [fromGodownId, setFromGodownId] = useState('');
  const [toGodownId, setToGodownId] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [transferMessage, setTransferMessage] = useState<string | null>(null);

  const rows = godowns.data ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((godown) => {
      if (kindFilter === 'standalone' && godown.branch) return false;
      if (kindFilter === 'office' && !godown.branch) return false;
      if (kindFilter === 'default' && !godown.is_default) return false;
      if (!term) return true;
      return [
        godown.name,
        godown.code ?? '',
        godown.branch_name ?? '',
        godown.city ?? '',
        godown.address_line1 ?? '',
        ...(godown.stocks ?? []).map((row) => row.product_name ?? ''),
      ]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [rows, search, kindFilter]);

  const saving = createGodown.isPending || patchGodown.isPending;
  const transferring = createTransfer.isPending;
  const editing = rows.find((row) => row.id === editingId);
  const lockedDefault = Boolean(editing?.is_default);

  function openAddDialog() {
    setEditingId(null);
    setForm(emptyForm);
    setMessage(null);
    dialog.show();
  }

  function openEditDialog(godown: ShopGodown) {
    setEditingId(godown.id);
    setForm(formFromGodown(godown));
    setMessage(null);
    dialog.show();
  }

  function openTransferDialog(fromId?: string, toId?: string) {
    setFromGodownId(fromId || '');
    setToGodownId(toId || '');
    setProductId('');
    setQty('1');
    setTransferMessage(null);
    transferDialog.show();
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;
    if (!form.address.trim() || form.latitude == null || form.longitude == null) {
      setMessage(t('shop.godowns.errAddress'));
      return;
    }
    setMessage(null);
    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      is_default: form.isDefault,
      phone_number: form.phone.trim(),
      address_line1: form.address.trim(),
      address_line2: form.addressLine2.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      country: form.country.trim(),
      postal_code: form.postalCode.trim(),
      latitude: form.latitude,
      longitude: form.longitude,
    };
    try {
      if (editingId) {
        await patchGodown.mutateAsync({ godownId: editingId, body: payload });
        dialog.hide();
        window.setTimeout(() => snackbar.push(t('shop.godowns.toastSaved'), 'success'), 0);
      } else {
        await createGodown.mutateAsync(payload);
        dialog.hide();
        window.setTimeout(() => snackbar.push(t('shop.godowns.toastAdded'), 'success'), 0);
      }
      setForm(emptyForm);
      setEditingId(null);
    } catch (error) {
      const text = error instanceof Error ? error.message : t('shop.godowns.errSave');
      setMessage(text);
      snackbar.push(text, 'error');
    }
  }

  async function handleTransfer(event: React.FormEvent) {
    event.preventDefault();
    if (!fromGodownId || !toGodownId) {
      setTransferMessage(t('shop.godowns.errSelectFromTo'));
      return;
    }
    if (fromGodownId === toGodownId) {
      setTransferMessage(t('shop.godowns.errSameGodown'));
      return;
    }
    if (!productId || !(Number(qty) > 0)) {
      setTransferMessage(t('shop.godowns.errSelectProductQty'));
      return;
    }
    setTransferMessage(null);
    try {
      const result = await createTransfer.mutateAsync({
        from_godown_id: fromGodownId,
        to_godown_id: toGodownId,
        transfer_date: todayIso(),
        lines: [{ product_id: productId, quantity: qty }],
      });
      transferDialog.hide();
      window.setTimeout(
        () => snackbar.push(t('shop.godowns.toastTransferCreated', { number: result.transfer_number }), 'success'),
        0,
      );
    } catch (error) {
      const text = error instanceof Error ? error.message : t('shop.godowns.errTransfer');
      setTransferMessage(text);
      snackbar.push(text, 'error');
    }
  }

  return (
    <div className="page-stack">
      <Card>
        <ShopFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('shop.godowns.searchPlaceholder')}
          onClear={() => {
            setSearch('');
            setKindFilter('');
          }}
          filters={[
            {
              id: 'kind',
              label: t('shop.godowns.type'),
              value: kindFilter,
              onChange: setKindFilter,
              options: [
                { value: '', label: t('shop.godowns.allLocations') },
                { value: 'standalone', label: t('shop.godowns.standalone') },
                { value: 'office', label: t('shop.godowns.office') },
                { value: 'default', label: t('shop.godowns.defaultPos') },
              ],
            },
          ]}
          action={
            <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
              <Button type="button" variant="neutral" onClick={() => openTransferDialog()}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <ArrowLeftRight size={16} aria-hidden="true" />
                  {t('shop.godowns.transfer')}
                </span>
              </Button>
              <Button type="button" variant="primary" onClick={openAddDialog}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={16} aria-hidden="true" />
                  {t('shop.godowns.addGodown')}
                </span>
              </Button>
            </span>
          }
        />

        {godowns.isLoading ? <p>{t('common.loading')}</p> : null}
        {godowns.error ? <p role="alert">{(godowns.error as Error).message}</p> : null}

        {(transfers.data ?? []).length ? (
          <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            <strong>{t('shop.godowns.recentTransfers')}</strong>
            {(transfers.data ?? []).slice(0, 6).map((transfer) => (
              <div key={transfer.id} style={{ fontSize: 13, color: '#4b5563' }}>
                {transfer.from_godown_name || t('shop.godowns.from')} → {transfer.to_godown_name || t('shop.godowns.to')}
                {transfer.transfer_date ? ` · ${transfer.transfer_date}` : ''}
                {` · ${transfer.transfer_number}`}
              </div>
            ))}
          </div>
        ) : null}

        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map((godown) => {
            const lines = (godown.stocks ?? []).filter((row) => asNumber(row.quantity) > 0);
            const preview = lines.slice(0, 3);
            const skuCount = stockedCount(godown);
            return (
              <div
                key={godown.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  borderBottom: '1px solid var(--border, #ddd)',
                  paddingBottom: 8,
                  alignItems: 'flex-start',
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
                    <Warehouse size={20} aria-hidden="true" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <strong>
                      {godown.name}
                      {godown.is_default ? ` · ${t('shop.godowns.defaultPosSuffix')}` : ''}
                    </strong>
                    <div style={{ opacity: 0.8 }}>
                      {godown.branch
                        ? t('shop.godowns.officeLinked', { name: godown.branch_name || t('shop.godowns.linked') })
                        : t('shop.godowns.standaloneWarehouse')}
                      {godown.code ? ` · ${godown.code}` : ''}
                      {` · ${skuCount === 1 ? t('shop.godowns.skuCountOne') : t('shop.godowns.skuCount', { n: skuCount })}`}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {[godown.address_line1, godown.city, godown.state].filter(Boolean).join(', ') ||
                        t('shop.godowns.noMappedAddress')}
                    </div>
                    {preview.length ? (
                      <div style={{ fontSize: 12, marginTop: 6, color: '#4b5563' }}>
                        {preview
                          .map((row) => `${row.product_name || t('shop.godowns.item')} × ${formatQty(row.quantity)}`)
                          .join(' · ')}
                        {lines.length > 3 ? ` · ${t('shop.godowns.moreCount', { n: lines.length - 3 })}` : ''}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, marginTop: 6, color: '#9ca3af' }}>
                        {t('shop.godowns.noStock')}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Button type="button" variant="neutral" onClick={() => openTransferDialog(godown.id)}>
                    {t('shop.godowns.send')}
                  </Button>
                  <Button
                    type="button"
                    variant="neutral"
                    onClick={() => openTransferDialog(undefined, godown.id)}
                  >
                    {t('shop.godowns.receive')}
                  </Button>
                  {godown.branch ? (
                    <Link to="/settings/business" style={{ fontSize: 13, alignSelf: 'center' }}>
                      {t('shop.godowns.editOffice')}
                    </Link>
                  ) : (
                    <Button type="button" variant="neutral" onClick={() => openEditDialog(godown)}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Pencil size={14} aria-hidden="true" />
                        {t('shop.godowns.edit')}
                      </span>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {!godowns.isLoading && !filtered.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <p>
                {rows.length
                  ? t('shop.godowns.emptyFiltered')
                  : t('shop.godowns.emptyNone')}
              </p>
              {!rows.length ? (
                <Button type="button" variant="primary" onClick={openAddDialog}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={16} aria-hidden="true" />
                    {t('shop.godowns.addFirst')}
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
        title={editingId ? t('shop.godowns.editGodown') : t('shop.godowns.addGodown')}
        labelledBy="godown-dialog"
        busy={saving}
      >
        <form onSubmit={handleSave} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
            {t('shop.godowns.dialogHint')}
          </p>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
            <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <span style={fieldLabel}>{t('shop.godowns.name')}</span>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
                placeholder={t('shop.godowns.namePlaceholder')}
                style={fieldInput}
              />
            </label>
            <div style={{ gridColumn: '1 / -1' }}>
              <AddressLocationPicker
                label={t('shop.godowns.godownAddress')}
                value={form.address}
                latitude={form.latitude}
                longitude={form.longitude}
                onChangeText={(value) => setForm({ ...form, address: value })}
                onPlaceSelected={(place) => {
                  const cleared =
                    !place.line1 &&
                    !place.formattedAddress &&
                    place.latitude == null &&
                    place.longitude == null;
                  setForm((current) => ({
                    ...current,
                    address: place.line1 || place.formattedAddress,
                    addressLine2: cleared ? '' : current.addressLine2,
                    city: place.city || '',
                    state: place.state || '',
                    country: place.country || '',
                    postalCode: place.postalCode || '',
                    latitude: place.latitude ?? null,
                    longitude: place.longitude ?? null,
                  }));
                }}
              />
            </div>
            <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <span style={fieldLabel}>{t('shop.godowns.line2')}</span>
              <input
                value={form.addressLine2}
                onChange={(event) => setForm({ ...form, addressLine2: event.target.value })}
                placeholder={t('shop.godowns.line2Placeholder')}
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>{t('shop.godowns.city')}</span>
              <input
                value={form.city}
                readOnly={form.latitude != null && form.longitude != null}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
                style={{
                  ...fieldInput,
                  background: form.latitude != null && form.longitude != null ? '#f9fafb' : '#fff',
                }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>{t('shop.godowns.state')}</span>
              <input
                value={form.state}
                readOnly={form.latitude != null && form.longitude != null}
                onChange={(event) => setForm({ ...form, state: event.target.value })}
                style={{
                  ...fieldInput,
                  background: form.latitude != null && form.longitude != null ? '#f9fafb' : '#fff',
                }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>{t('shop.godowns.country')}</span>
              <input
                value={form.country}
                readOnly={form.latitude != null && form.longitude != null}
                onChange={(event) => setForm({ ...form, country: event.target.value })}
                style={{
                  ...fieldInput,
                  background: form.latitude != null && form.longitude != null ? '#f9fafb' : '#fff',
                }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>{t('shop.godowns.postalCode')}</span>
              <input
                value={form.postalCode}
                readOnly={form.latitude != null && form.longitude != null}
                onChange={(event) => setForm({ ...form, postalCode: event.target.value })}
                style={{
                  ...fieldInput,
                  background: form.latitude != null && form.longitude != null ? '#f9fafb' : '#fff',
                }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>{t('shop.godowns.pickupPhone')}</span>
              <input
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder={t('shop.godowns.optional')}
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>{t('shop.godowns.code')}</span>
              <input
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })}
                placeholder={t('shop.godowns.optional')}
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={form.isDefault}
                disabled={lockedDefault}
                onChange={(event) => setForm({ ...form, isDefault: event.target.checked })}
              />
              {t('shop.godowns.defaultGodown')}
            </label>
          </div>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>
            {lockedDefault
              ? t('shop.godowns.lockedDefaultHint')
              : t('shop.godowns.defaultHint')}
          </p>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? t('common.saving') : editingId ? t('common.saveChanges') : t('shop.godowns.createGodown')}
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide} disabled={saving}>
              {t('common.cancel')}
            </Button>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </form>
      </Dialog>

      <Dialog
        open={transferDialog.open}
        onClose={transferDialog.hide}
        title={t('shop.godowns.stockTransfer')}
        labelledBy="transfer-dialog"
        busy={transferring}
      >
        <form onSubmit={handleTransfer} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabel}>{t('shop.godowns.fromGodown')}</span>
            <select
              value={fromGodownId}
              onChange={(event) => setFromGodownId(event.target.value)}
              style={fieldInput}
            >
              <option value="">{t('shop.godowns.selectGodown')}</option>
              {rows.map((godown) => (
                <option key={godown.id} value={godown.id}>
                  {godown.code ? `${godown.name} (${godown.code})` : godown.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabel}>{t('shop.godowns.toGodown')}</span>
            <select
              value={toGodownId}
              onChange={(event) => setToGodownId(event.target.value)}
              style={fieldInput}
            >
              <option value="">{t('shop.godowns.selectGodown')}</option>
              {rows.map((godown) => (
                <option key={godown.id} value={godown.id}>
                  {godown.code ? `${godown.name} (${godown.code})` : godown.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabel}>{t('shop.godowns.product')}</span>
            <select
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              style={fieldInput}
            >
              <option value="">{t('shop.godowns.chooseProduct')}</option>
              {(products.data ?? []).map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabel}>{t('shop.godowns.quantity')}</span>
            <input
              value={qty}
              onChange={(event) => setQty(event.target.value.replace(/[^0-9.]/g, ''))}
              style={fieldInput}
            />
          </label>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={transferring}>
              {transferring ? t('common.saving') : t('shop.godowns.createTransfer')}
            </Button>
            <Button type="button" variant="neutral" onClick={transferDialog.hide} disabled={transferring}>
              {t('common.cancel')}
            </Button>
          </div>
          {transferMessage ? <p role="status">{transferMessage}</p> : null}
        </form>
      </Dialog>
    </div>
  );
}
