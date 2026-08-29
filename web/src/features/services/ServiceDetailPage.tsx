import React, { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDialog } from '../../hooks/useDialog';
import { useEditFormInit } from '../../hooks/useEditFormInit';
import { useAuth } from '../../hooks/useAuth';
import { useServiceDetail, useServiceUpdate } from '../management/managementHooks';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import type { Service, ServiceUpdateInput } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { LogoUploadField } from '../../components/LogoUploadField';
import { formatTimestamp } from '../../lib/datetime';
import { resolveMediaAssetUrl } from '../../lib/mediaUrl';
import { canWriteServices } from '../../utils/roles';
import { uploadServiceImage } from './uploadServiceImage';

export function ServiceDetailPage() {
  const auth = useAuth();
  const canManageServices = canWriteServices(auth.user);
  const workspace = useWorkspace();
  const currency = workspace.activeBusiness?.currency ?? 'USD';
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const serviceQuery = useServiceDetail(serviceId);
  const updateService = useServiceUpdate();
  const editDialog = useDialog();
  const [formState, setFormState] = useState({
    name: '',
    display_name: '',
    description: '',
    status: 'active',
    duration_minutes: 30,
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    cleanup_minutes: 0,
    price: '',
    loyalty_points_earn: 0,
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);

  const initForm = useCallback((service: Service) => {
    setFormState({
      name: service.name ?? '',
      display_name: service.name ?? '',
      description: service.description ?? '',
      status: service.status ?? 'active',
      duration_minutes: service.duration_minutes ?? 30,
      buffer_before_minutes: service.buffer_before_minutes ?? 0,
      buffer_after_minutes: service.buffer_after_minutes ?? 0,
      cleanup_minutes: service.cleanup_minutes ?? 0,
      price: service.price != null ? String(service.price) : '',
      loyalty_points_earn: service.loyalty_points_earn ?? 0,
    });
    setCurrentImageUrl(resolveMediaAssetUrl(service.image_url));
    setImageFile(null);
    setRemoveImage(false);
  }, []);

  useEditFormInit(editDialog.open, serviceQuery.data, initForm);

  const serviceName = serviceQuery.data?.name ?? 'Service profile';

  function formatPrice(amount?: number, code = currency) {
    if (amount == null) return '—';
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(amount);
    } catch {
      return `${code} ${amount.toFixed(2)}`;
    }
  }

  function buildUpdatePayload(primaryImage?: ServiceUpdateInput['primary_image']): ServiceUpdateInput {
    const priceValue = formState.price.trim();
    return {
      name: formState.name,
      display_name: formState.display_name || formState.name,
      short_description: formState.description,
      status: formState.status,
      loyalty_points_earn: Math.max(0, Number(formState.loyalty_points_earn) || 0),
      default_duration: {
        duration_minutes: formState.duration_minutes,
        buffer_before_minutes: formState.buffer_before_minutes,
        buffer_after_minutes: formState.buffer_after_minutes,
        cleanup_minutes: formState.cleanup_minutes,
        is_default: true,
      },
      ...(priceValue
        ? {
            default_price: {
              base_price: priceValue,
              currency,
              is_default: true,
            },
          }
        : {}),
      ...(primaryImage ? { primary_image: primaryImage } : {}),
    };
  }

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: '#f5f7fb', color: '#111827' }}>
      <div style={{ maxWidth: 920, margin: '0 auto', display: 'grid', gap: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1 }}>Service Detail</p>
            <h1 style={{ margin: '8px 0 0', fontSize: 32 }}>{serviceName}</h1>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={() => navigate('/services')}>Back to services</Button>
            {canManageServices ? (
              <Button
                variant="primary"
                onClick={() => {
                  if (serviceQuery.data) editDialog.show();
                }}
                disabled={!serviceQuery.data}
              >
                Edit service
              </Button>
            ) : null}
          </div>
        </div>

        <Card style={{ display: 'grid', gap: 24 }}>
          {serviceQuery.isLoading ? (
            <div style={{ padding: 28, textAlign: 'center' }}>Loading service...</div>
          ) : serviceQuery.error ? (
            <div style={{ padding: 28, textAlign: 'center', color: '#dc2626' }}>{serviceQuery.error.message}</div>
          ) : serviceQuery.data ? (
            <div style={{ display: 'grid', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Name</p>
                  <p style={{ margin: '8px 0 0', fontSize: 20, fontWeight: 700 }}>{serviceQuery.data.name ?? 'Untitled service'}</p>
                </div>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Status</p>
                  <p style={{ margin: '8px 0 0', fontSize: 20, fontWeight: 700 }}>{serviceQuery.data.status ?? 'Unknown'}</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Duration</p>
                  <p style={{ margin: '8px 0 0' }}>{serviceQuery.data.duration_minutes ? `${serviceQuery.data.duration_minutes} min` : '—'}</p>
                </div>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Price</p>
                  <p style={{ margin: '8px 0 0' }}>{formatPrice(serviceQuery.data.price, serviceQuery.data.currency ?? currency)}</p>
                </div>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Reward points on complete</p>
                  <p style={{ margin: '8px 0 0' }}>{serviceQuery.data.loyalty_points_earn ?? 0}</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Buffer before</p>
                  <p style={{ margin: '8px 0 0' }}>{serviceQuery.data.buffer_before_minutes ?? 0} min</p>
                </div>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Buffer after</p>
                  <p style={{ margin: '8px 0 0' }}>{serviceQuery.data.buffer_after_minutes ?? 0} min</p>
                </div>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Cleanup</p>
                  <p style={{ margin: '8px 0 0' }}>{serviceQuery.data.cleanup_minutes ?? 0} min</p>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 16 }}>
                <p style={{ margin: 0, color: '#6b7280' }}>Description</p>
                <p style={{ margin: '8px 0 0' }}>{serviceQuery.data.description ?? 'No description available.'}</p>
              </div>

              {serviceQuery.data.image_url ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  <p style={{ margin: 0, color: '#6b7280' }}>Image</p>
                  <img
                    src={resolveMediaAssetUrl(serviceQuery.data.image_url) ?? ''}
                    alt={serviceQuery.data.name ?? 'Service'}
                    style={{ width: '100%', maxWidth: 320, height: 180, objectFit: 'cover', borderRadius: 12, border: '1px solid #e5e7eb' }}
                  />
                </div>
              ) : null}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Created</p>
                  <p style={{ margin: '8px 0 0' }}>{serviceQuery.data.created_at ? formatTimestamp(serviceQuery.data.created_at) : '—'}</p>
                </div>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Updated</p>
                  <p style={{ margin: '8px 0 0' }}>{serviceQuery.data.updated_at ? formatTimestamp(serviceQuery.data.updated_at) : '—'}</p>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: 28, textAlign: 'center', color: '#6b7280' }}>Service not found.</div>
          )}
        </Card>
      </div>

      <Dialog open={editDialog.open} onClose={editDialog.hide} title="Edit service" labelledBy="edit-service-dialog">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setEditError(null);
            if (!serviceId) return;

            void (async () => {
              setSaving(true);
              try {
                let primaryImage: ServiceUpdateInput['primary_image'];
                const serviceName = formState.display_name || formState.name;
                const businessId = workspace.businessId;

                if (imageFile) {
                  if (!auth.token || !workspace.tenantId || !businessId) {
                    throw new Error('Sign in and select a business to upload a service image.');
                  }
                  const mediaId = await uploadServiceImage({
                    accessToken: auth.token,
                    tenantId: workspace.tenantId,
                    businessId,
                    imageFile,
                    serviceName,
                  });
                  primaryImage = { media_id: mediaId };
                } else if (removeImage) {
                  primaryImage = { clear: true };
                }

                await updateService.mutateAsync({
                  serviceId,
                  service: buildUpdatePayload(primaryImage),
                });
                editDialog.hide();
                await serviceQuery.refetch();
              } catch (err) {
                setEditError(err instanceof Error ? err.message : 'Failed to update service');
              } finally {
                setSaving(false);
              }
            })();
          }}
          style={{ display: 'grid', gap: 16, marginTop: 12 }}
        >
          <input
            required
            value={formState.name}
            onChange={(event) => setFormState({ ...formState, name: event.target.value })}
            placeholder="Service name"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <input
            value={formState.display_name}
            onChange={(event) => setFormState({ ...formState, display_name: event.target.value })}
            placeholder="Display name"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 8 }}>
              Duration (minutes)
              <input
                required
                type="number"
                min={15}
                step={15}
                value={formState.duration_minutes}
                onChange={(event) => setFormState({ ...formState, duration_minutes: Number(event.target.value) })}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 8 }}>
              Price ({currency})
              <input
                type="number"
                min={0}
                step={0.01}
                value={formState.price}
                onChange={(event) => setFormState({ ...formState, price: event.target.value })}
                placeholder="0.00"
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 8 }}>
              Points earned on complete
              <input
                type="number"
                min={0}
                step={1}
                value={formState.loyalty_points_earn}
                onChange={(event) =>
                  setFormState({ ...formState, loyalty_points_earn: Number(event.target.value) || 0 })
                }
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 8 }}>
              Buffer before (min)
              <input
                type="number"
                min={0}
                step={5}
                value={formState.buffer_before_minutes}
                onChange={(event) => setFormState({ ...formState, buffer_before_minutes: Number(event.target.value) })}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 8 }}>
              Buffer after (min)
              <input
                type="number"
                min={0}
                step={5}
                value={formState.buffer_after_minutes}
                onChange={(event) => setFormState({ ...formState, buffer_after_minutes: Number(event.target.value) })}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 8 }}>
              Cleanup (min)
              <input
                type="number"
                min={0}
                step={5}
                value={formState.cleanup_minutes}
                onChange={(event) => setFormState({ ...formState, cleanup_minutes: Number(event.target.value) })}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
            </label>
          </div>
          <select
            value={formState.status}
            onChange={(event) => setFormState({ ...formState, status: event.target.value })}
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <textarea
            value={formState.description}
            onChange={(event) => setFormState({ ...formState, description: event.target.value })}
            placeholder="Description"
            rows={4}
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <LogoUploadField
            value={imageFile}
            onChange={(file) => {
              setImageFile(file);
              if (file) setRemoveImage(false);
              if (!file && currentImageUrl) setRemoveImage(true);
            }}
            currentLogoUrl={removeImage ? null : currentImageUrl}
            label="Service image (optional)"
            hint="PNG, JPG, or WebP. Shown in the mobile app when customers browse services."
            dropzoneTitle="Upload a service image"
            dropzoneSubtitle="Click to choose an image file"
            previewAlt="Service image preview"
          />
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={updateService.isPending || saving}>
              {updateService.isPending || saving ? 'Saving…' : 'Save changes'}
            </Button>
            <Button type="button" variant="neutral" onClick={editDialog.hide}>Cancel</Button>
          </div>
          {editError ? <div style={{ color: '#dc2626' }}>{editError}</div> : null}
        </form>
      </Dialog>
    </div>
  );
}
