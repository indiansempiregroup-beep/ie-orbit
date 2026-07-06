import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDialog } from '../../hooks/useDialog';
import { useServiceDetail, useServiceUpdate } from '../management/managementHooks';
import type { ServiceUpdateInput } from '@ie-platform/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useTheme } from '../../hooks/useTheme';

export function ServiceDetailPage() {
  const theme = useTheme();
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const serviceQuery = useServiceDetail(serviceId);
  const updateService = useServiceUpdate();
  const editDialog = useDialog();
  const [formState, setFormState] = useState<ServiceUpdateInput>({
    name: '',
    display_name: '',
    description: '',
    status: 'active',
  });
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (editDialog.open && serviceQuery.data) {
      setFormState({
        name: serviceQuery.data.name ?? '',
        display_name: serviceQuery.data.name ?? '',
        description: serviceQuery.data.description ?? '',
        status: serviceQuery.data.status ?? 'active',
      });
    }
  }, [editDialog.open, serviceQuery.data]);

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: theme.resolved === 'dark' ? '#0f172a' : '#f5f7fb', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}>
      <div style={{ maxWidth: 920, margin: '0 auto', display: 'grid', gap: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1 }}>Service Detail</p>
            <h1 style={{ margin: '8px 0 0', fontSize: 32 }}>Service profile</h1>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={() => navigate('/services')}>Back to services</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (serviceQuery.data) editDialog.show();
              }}
              disabled={!serviceQuery.data}
            >
              Edit service
            </Button>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Duration</p>
                  <p style={{ margin: '8px 0 0' }}>{serviceQuery.data.duration_minutes ? `${serviceQuery.data.duration_minutes} min` : '—'}</p>
                </div>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Price</p>
                  <p style={{ margin: '8px 0 0' }}>{serviceQuery.data.price != null ? `$${serviceQuery.data.price.toFixed(2)}` : '—'}</p>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 16 }}>
                <p style={{ margin: 0, color: '#6b7280' }}>Description</p>
                <p style={{ margin: '8px 0 0' }}>{serviceQuery.data.description ?? 'No description available.'}</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Created</p>
                  <p style={{ margin: '8px 0 0' }}>{serviceQuery.data.created_at ? new Date(serviceQuery.data.created_at).toLocaleString() : '—'}</p>
                </div>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Updated</p>
                  <p style={{ margin: '8px 0 0' }}>{serviceQuery.data.updated_at ? new Date(serviceQuery.data.updated_at).toLocaleString() : '—'}</p>
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
            updateService.mutate(
              { serviceId, service: formState },
              {
                onSuccess: () => editDialog.hide(),
                onError: (err) => setEditError(err.message ?? 'Failed to update service'),
              },
            );
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
          <textarea
            value={formState.description ?? ''}
            onChange={(event) => setFormState({ ...formState, description: event.target.value })}
            placeholder="Description"
            rows={4}
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <input
            value={formState.status ?? ''}
            onChange={(event) => setFormState({ ...formState, status: event.target.value })}
            placeholder="Status"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={updateService.isPending}>
              {updateService.isPending ? 'Saving…' : 'Save changes'}
            </Button>
            <Button type="button" variant="neutral" onClick={editDialog.hide}>Cancel</Button>
          </div>
          {editError ? <div style={{ color: '#dc2626' }}>{editError}</div> : null}
        </form>
      </Dialog>
    </div>
  );
}
