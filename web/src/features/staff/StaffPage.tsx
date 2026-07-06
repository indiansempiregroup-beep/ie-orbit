import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStaffCreate, useStaffList, useStaffSearch } from '../management/managementHooks';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useTheme } from '../../hooks/useTheme';

export function StaffPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const createStaff = useStaffCreate();
  const [formState, setFormState] = useState({
    business: '',
    staff_code: '',
    display_name: '',
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    designation: '',
    department: '',
    employment_status: 'active',
  });
  const [creationError, setCreationError] = useState<string | null>(null);
  const { data: staff, isLoading, error, refetch } = useStaffList();
  const search = useStaffSearch(searchTerm);
  const dialog = useDialog();

  const selectedData = searchTerm.trim() ? search.data ?? [] : staff ?? [];

  const staffSummary = useMemo(() => {
    const total = staff?.length ?? 0;
    const active = staff?.filter((member) => member.status === 'active').length ?? 0;
    const inactive = total - active;
    return { total, active, inactive };
  }, [staff]);

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: theme.resolved === 'dark' ? '#0f172a' : '#f5f7fb', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gap: 24 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1 }}>Staff Management</p>
            <h1 style={{ margin: '8px 0 0', fontSize: 32 }}>Staff</h1>
            <p style={{ margin: 0, color: '#6b7280' }}>Manage team members, assignments, and schedules quickly.</p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => dialog.show()}>Add staff</Button>
            <Button variant="neutral" onClick={() => refetch()}>Refresh</Button>
          </div>
        </header>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <Card style={{ minHeight: 120 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Total staff</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{staffSummary.total}</p>
          </Card>
          <Card style={{ minHeight: 120 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Active</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{staffSummary.active}</p>
          </Card>
          <Card style={{ minHeight: 120 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Inactive</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{staffSummary.inactive}</p>
          </Card>
        </div>

        <section style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search staff by name, email or status"
              style={{ flex: 1, borderRadius: 14, border: '1px solid #e5e7eb', padding: '12px 16px', background: theme.resolved === 'dark' ? '#111827' : '#fff', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}
              aria-label="Search staff"
            />
            <Button variant="ghost" onClick={() => setSearchTerm('')}>Clear</Button>
          </div>

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', padding: '16px 20px', background: theme.resolved === 'dark' ? '#111827' : '#f9fafb', fontWeight: 700, color: '#6b7280' }}>
              <span>Name</span>
              <span>Email</span>
              <span>Joined</span>
              <span>Status</span>
            </div>
            <div style={{ display: 'grid', gap: 1, background: theme.resolved === 'dark' ? '#0f172a' : '#fff' }}>
              {isLoading || search.isLoading ? (
                <div style={{ padding: 28, textAlign: 'center' }}>Loading staff…</div>
              ) : error || search.error ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#dc2626' }}>{error?.message ?? search.error?.message ?? 'Unable to load staff'}</div>
              ) : selectedData.length === 0 ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#6b7280' }}>No staff found.</div>
              ) : (
                selectedData.map((member) => (
                  <div
                    key={member.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => member.id && navigate(`/staff/${member.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        member.id && navigate(`/staff/${member.id}`);
                      }
                    }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.5fr 1fr 1fr 1fr',
                      padding: '16px 20px',
                      background: theme.resolved === 'dark' ? '#111827' : '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <span>{member.full_name ?? 'Team member'}</span>
                    <span>{member.email ?? '—'}</span>
                    <span>{member.created_at ? new Date(member.created_at).toLocaleDateString() : '—'}</span>
                    <span style={{ color: member.status === 'active' ? '#10b981' : '#6b7280' }}>{member.status ?? 'Unknown'}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </section>
      </div>

      <Dialog open={dialog.open} onClose={dialog.hide} title="Add staff" labelledBy="add-staff-dialog">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setCreationError(null);
            createStaff.mutate(formState, {
              onSuccess: () => {
                dialog.hide();
                setFormState({
                  business: '',
                  staff_code: '',
                  display_name: '',
                  first_name: '',
                  last_name: '',
                  email: '',
                  phone_number: '',
                  designation: '',
                  department: '',
                  employment_status: 'active',
                });
              },
              onError: (err) => {
                setCreationError(err.message ?? 'Failed to create staff');
              },
            });
          }}
          style={{ display: 'grid', gap: 16, marginTop: 12 }}
        >
          <input
            required
            value={formState.business}
            onChange={(event) => setFormState({ ...formState, business: event.target.value })}
            placeholder="Business ID"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <input
            required
            value={formState.staff_code}
            onChange={(event) => setFormState({ ...formState, staff_code: event.target.value })}
            placeholder="Staff code"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <input
            required
            value={formState.display_name}
            onChange={(event) => setFormState({ ...formState, display_name: event.target.value })}
            placeholder="Display name"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input
              value={formState.email}
              onChange={(event) => setFormState({ ...formState, email: event.target.value })}
              placeholder="Email"
              type="email"
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
            <input
              value={formState.phone_number}
              onChange={(event) => setFormState({ ...formState, phone_number: event.target.value })}
              placeholder="Phone number"
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={createStaff.isPending}>
              {createStaff.isPending ? 'Creating…' : 'Create staff'}
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide}>Cancel</Button>
          </div>
          {creationError ? <div style={{ color: '#dc2626' }}>{creationError}</div> : null}
        </form>
      </Dialog>
    </div>
  );
}
