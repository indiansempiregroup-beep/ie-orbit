import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServiceCreate, useServiceList, useServiceSearch, useServiceUpdate } from '../management/managementHooks';
import { BusinessWorkspaceSelect } from '../../components/BusinessWorkspaceSelect';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { LogoUploadField } from '../../components/LogoUploadField';
import { ManagementListToolbar } from '../../components/ManagementListToolbar';
import { useActiveBusinessFormField, useBusinessFormChange } from '../../hooks/useActiveBusinessFormField';
import { useAuth } from '../../hooks/useAuth';
import { useDialog } from '../../hooks/useDialog';
import { useTheme } from '../../hooks/useTheme';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { resolveMediaAssetUrl } from '../../lib/mediaUrl';
import { uploadServiceImage } from './uploadServiceImage';

export function ServicesPage() {
  const theme = useTheme();
  const auth = useAuth();
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const createService = useServiceCreate();
  const updateService = useServiceUpdate();
  const currency = workspace.activeBusiness?.currency ?? 'USD';
  const [formState, setFormState] = useState({
    business: '',
    service_code: '',
    name: '',
    display_name: '',
    status: 'active',
    short_description: '',
    duration_minutes: 30,
    price: '',
  });
  const [creationError, setCreationError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { data: services, isLoading, error, refetch } = useServiceList();
  const search = useServiceSearch(searchTerm);
  const dialog = useDialog();
  const handleBusinessFormChange = useBusinessFormChange((business) => {
    setFormState((current) => ({ ...current, business }));
  });
  useActiveBusinessFormField(dialog.open, formState.business, (business) => {
    setFormState((current) => ({ ...current, business }));
  });

  const selectedData = searchTerm.trim() ? search.data ?? [] : services ?? [];

  const serviceSummary = useMemo(() => {
    const total = services?.length ?? 0;
    const active = services?.filter((service) => service.status === 'active').length ?? 0;
    const inactive = total - active;
    return { total, active, inactive };
  }, [services]);

  function resetForm() {
    setFormState({
      business: '',
      service_code: '',
      name: '',
      display_name: '',
      status: 'active',
      short_description: '',
      duration_minutes: 30,
      price: '',
    });
    setImageFile(null);
  }

  function formatPrice(service: { price?: number; currency?: string | null }) {
    if (service.price == null) return '—';
    const code = service.currency ?? currency;
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(service.price);
    } catch {
      return `${code} ${service.price.toFixed(2)}`;
    }
  }

  const tableColumns = '56px 2fr 1fr 1fr 0.8fr 1.2fr';

  function ServiceThumbnail({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
    const src = resolveMediaAssetUrl(imageUrl);
    if (src) {
      return (
        <img
          src={src}
          alt={name}
          style={{
            width: 48,
            height: 48,
            borderRadius: 10,
            objectFit: 'cover',
            border: '1px solid #e5e7eb',
            background: theme.resolved === 'dark' ? '#1f2937' : '#f3f4f6',
          }}
        />
      );
    }

    return (
      <div
        aria-hidden
        style={{
          width: 48,
          height: 48,
          borderRadius: 10,
          border: '1px solid #e5e7eb',
          background: theme.resolved === 'dark' ? '#1f2937' : '#f3f4f6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af',
          fontSize: 18,
          fontWeight: 700,
        }}
      >
        {(name.trim()[0] ?? '?').toUpperCase()}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: theme.resolved === 'dark' ? '#0f172a' : '#f5f7fb', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gap: 24 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1 }}>Service Management</p>
            <h1 style={{ margin: '8px 0 0', fontSize: 32 }}>Services</h1>
            <p style={{ margin: 0, color: '#6b7280' }}>Create and maintain appointment services, duration, and pricing.</p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => dialog.show()}>Add service</Button>
            <Button variant="neutral" onClick={() => refetch()}>Refresh</Button>
          </div>
        </header>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <Card style={{ minHeight: 120 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Total services</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{serviceSummary.total}</p>
          </Card>
          <Card style={{ minHeight: 120 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Active</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{serviceSummary.active}</p>
          </Card>
          <Card style={{ minHeight: 120 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Inactive</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{serviceSummary.inactive}</p>
          </Card>
        </div>

        <section style={{ display: 'grid', gap: 16 }}>
          <ManagementListToolbar
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder="Search services by name, description or status"
            searchAriaLabel="Search services"
            onClear={() => setSearchTerm('')}
          />

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: tableColumns, padding: '16px 20px', background: theme.resolved === 'dark' ? '#111827' : '#f9fafb', fontWeight: 700, color: '#6b7280' }}>
              <span aria-hidden />
              <span>Service</span>
              <span>Duration</span>
              <span>Price</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            <div style={{ display: 'grid', gap: 1, background: theme.resolved === 'dark' ? '#0f172a' : '#fff' }}>
              {isLoading || search.isLoading ? (
                <div style={{ padding: 28, textAlign: 'center' }}>Loading services…</div>
              ) : error || search.error ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#dc2626' }}>{error?.message ?? search.error?.message ?? 'Unable to load services'}</div>
              ) : selectedData.length === 0 ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#6b7280' }}>No services found.</div>
              ) : (
                selectedData.map((service) => {
                  const isActive = service.status === 'active';
                  const serviceName = service.name ?? 'Untitled service';
                  return (
                    <div
                      key={service.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: tableColumns,
                        padding: '16px 20px',
                        background: theme.resolved === 'dark' ? '#111827' : '#fff',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <ServiceThumbnail name={serviceName} imageUrl={service.image_url} />
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={() => service.id && navigate(`/services/${service.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            service.id && navigate(`/services/${service.id}`);
                          }
                        }}
                        style={{ cursor: 'pointer', fontWeight: 600 }}
                      >
                        {serviceName}
                      </span>
                      <span>{service.duration_minutes ? `${service.duration_minutes} min` : '—'}</span>
                      <span>{formatPrice(service)}</span>
                      <span style={{ color: isActive ? '#10b981' : '#6b7280' }}>{service.status ?? 'Unknown'}</span>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Button
                          type="button"
                          variant={isActive ? 'neutral' : 'primary'}
                          disabled={updateService.isPending}
                          onClick={() =>
                            service.id &&
                            updateService.mutate({
                              serviceId: service.id,
                              service: { status: isActive ? 'inactive' : 'active' },
                            })
                          }
                        >
                          {isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </section>
      </div>

      <Dialog open={dialog.open} onClose={dialog.hide} title="Add service" labelledBy="add-service-dialog">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setCreationError(null);
            const priceValue = formState.price.trim();
            const serviceName = formState.display_name || formState.name;

            void (async () => {
              setSubmitting(true);
              try {
                let primaryImage: { media_id: string } | undefined;
                const businessId = formState.business || workspace.businessId;
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
                }

                await createService.mutateAsync({
                  business: formState.business,
                  service_code: formState.service_code,
                  name: formState.name,
                  display_name: serviceName,
                  status: formState.status,
                  short_description: formState.short_description,
                  default_duration: {
                    duration_minutes: formState.duration_minutes,
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
                });

                dialog.hide();
                resetForm();
              } catch (err) {
                setCreationError(err instanceof Error ? err.message : 'Failed to create service');
              } finally {
                setSubmitting(false);
              }
            })();
          }}
          style={{ display: 'grid', gap: 16, marginTop: 12 }}
        >
          <BusinessWorkspaceSelect
            value={formState.business}
            onChange={handleBusinessFormChange}
            showManageLink={false}
          />
          <input
            required
            value={formState.service_code}
            onChange={(event) => setFormState({ ...formState, service_code: event.target.value })}
            placeholder="Service code"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
            value={formState.short_description}
            onChange={(event) => setFormState({ ...formState, short_description: event.target.value })}
            placeholder="Short description"
            rows={4}
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <LogoUploadField
            value={imageFile}
            onChange={setImageFile}
            label="Service image (optional)"
            hint="PNG, JPG, or WebP. Shown in the mobile app when customers browse services."
            dropzoneTitle="Upload a service image"
            dropzoneSubtitle="Click to choose an image file"
            previewAlt="Service image preview"
          />
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={createService.isPending || submitting}>
              {createService.isPending || submitting ? 'Creating…' : 'Create service'}
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide}>Cancel</Button>
          </div>
          {creationError ? <div style={{ color: '#dc2626' }}>{creationError}</div> : null}
        </form>
      </Dialog>
    </div>
  );
}
