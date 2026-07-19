import React, { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDialog } from '../../hooks/useDialog';
import { useEditFormInit } from '../../hooks/useEditFormInit';
import { useStaffDetail, useStaffUpdate } from '../management/managementHooks';
import { StaffWeeklyScheduleSection } from './StaffWeeklyScheduleSection';
import type { StaffMember, StaffUpdateInput } from '@ie-platform/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { formatTimestamp } from '../../lib/datetime';
import { SubmitOverlay } from '../../components/SubmitOverlay';
import { useTheme } from '../../hooks/useTheme';
import { useSnackbar } from '../../hooks/useSnackbar';

export function StaffDetailPage() {
  const theme = useTheme();
  const snackbar = useSnackbar();
  const { staffId } = useParams();
  const navigate = useNavigate();
  const staffQuery = useStaffDetail(staffId);
  const updateStaff = useStaffUpdate();
  const editDialog = useDialog();
  const [formState, setFormState] = useState<StaffUpdateInput>({
    display_name: '',
    email: '',
    phone_number: '',
    employment_status: 'active',
  });
  const [editError, setEditError] = useState<string | null>(null);

  const initForm = useCallback((staff: StaffMember) => {
    setFormState({
      display_name: staff.full_name ?? '',
      email: staff.email ?? '',
      phone_number: staff.phone_number ?? '',
      employment_status: staff.status ?? 'active',
    });
  }, []);

  useEditFormInit(editDialog.open, staffQuery.data, initForm);

  const staffName = staffQuery.data?.full_name ?? 'Staff profile';

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: theme.resolved === 'dark' ? '#0f172a' : '#f5f7fb', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}>
      <SubmitOverlay show={updateStaff.isPending} message="Saving staff…" />
      <div style={{ maxWidth: 920, margin: '0 auto', display: 'grid', gap: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1 }}>Staff Detail</p>
            <h1 style={{ margin: '8px 0 0', fontSize: 32 }}>{staffName}</h1>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={() => navigate('/staff')}>Back to staff</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (staffQuery.data) editDialog.show();
              }}
              disabled={!staffQuery.data}
            >
              Edit staff
            </Button>
          </div>
        </div>

        <Card style={{ display: 'grid', gap: 24 }}>
          {staffQuery.isLoading ? (
            <div style={{ padding: 28, textAlign: 'center' }}>Loading staff...</div>
          ) : staffQuery.error ? (
            <div style={{ padding: 28, textAlign: 'center', color: '#dc2626' }}>{staffQuery.error.message}</div>
          ) : staffQuery.data ? (
            <div style={{ display: 'grid', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Name</p>
                  <p style={{ margin: '8px 0 0', fontSize: 20, fontWeight: 700 }}>{staffQuery.data.full_name ?? 'Unknown'}</p>
                </div>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Status</p>
                  <p style={{ margin: '8px 0 0', fontSize: 20, fontWeight: 700 }}>{staffQuery.data.status ?? 'Unknown'}</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Email</p>
                  <p style={{ margin: '8px 0 0' }}>{staffQuery.data.email ?? '—'}</p>
                </div>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Phone</p>
                  <p style={{ margin: '8px 0 0' }}>{staffQuery.data.phone_number ?? '—'}</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Joined</p>
                  <p style={{ margin: '8px 0 0' }}>{staffQuery.data.created_at ? formatTimestamp(staffQuery.data.created_at) : '—'}</p>
                </div>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Last updated</p>
                  <p style={{ margin: '8px 0 0' }}>{staffQuery.data.updated_at ? formatTimestamp(staffQuery.data.updated_at) : '—'}</p>
                </div>
              </div>

              <div>
                <p style={{ margin: 0, color: '#6b7280' }}>Staff ID</p>
                <p style={{ margin: '8px 0 0' }}>{staffQuery.data.id}</p>
              </div>
            </div>
          ) : (
            <div style={{ padding: 28, textAlign: 'center', color: '#6b7280' }}>Staff member not found.</div>
          )}
        </Card>

        {staffQuery.data?.id ? <StaffWeeklyScheduleSection staffId={staffQuery.data.id} /> : null}
      </div>

      <Dialog
        open={editDialog.open}
        onClose={editDialog.hide}
        title="Edit staff"
        labelledBy="edit-staff-dialog"
        busy={updateStaff.isPending}
        busyMessage="Saving staff…"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setEditError(null);
            if (!staffId) return;
            updateStaff.mutate(
              {
                staffId,
                staff: {
                  display_name: formState.display_name,
                  email: formState.email,
                  phone_number: formState.phone_number,
                  employment_status: formState.employment_status,
                },
              },
              {
                onSuccess: () => {
                  snackbar.push('Staff profile updated.', 'success');
                  editDialog.hide();
                  staffQuery.refetch();
                },
                onError: (err) => setEditError(err.message ?? 'Failed to update staff'),
              },
            );
          }}
          style={{ display: 'grid', gap: 16, marginTop: 12 }}
        >
          <input
            required
            value={formState.display_name ?? ''}
            onChange={(event) => setFormState({ ...formState, display_name: event.target.value })}
            placeholder="Display name"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input
              value={formState.email ?? ''}
              onChange={(event) => setFormState({ ...formState, email: event.target.value })}
              placeholder="Email"
              type="email"
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
            <input
              value={formState.phone_number ?? ''}
              onChange={(event) => setFormState({ ...formState, phone_number: event.target.value })}
              placeholder="Phone number"
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </div>
          <select
            value={formState.employment_status ?? 'active'}
            onChange={(event) => setFormState({ ...formState, employment_status: event.target.value })}
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" loading={updateStaff.isPending} loadingLabel="Saving…">
              Save changes
            </Button>
            <Button type="button" variant="neutral" onClick={editDialog.hide} disabled={updateStaff.isPending}>
              Cancel
            </Button>
          </div>
          {editError ? <div style={{ color: '#dc2626' }}>{editError}</div> : null}
        </form>
      </Dialog>
    </div>
  );
}
