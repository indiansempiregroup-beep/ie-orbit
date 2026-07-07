import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useBranchesQuery, useCreateBranch, useUpdateBranch } from './branchesHooks';

export function BranchesPanel() {
  const workspace = useWorkspace();
  const branchesQuery = useBranchesQuery();
  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch();
  const snackbar = useSnackbar();

  const [showForm, setShowForm] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [city, setCity] = useState('');

  if (!workspace.businessId) {
    return null;
  }

  async function handleCreate() {
    if (!branchName.trim()) {
      snackbar.push('Branch name is required.', 'warning');
      return;
    }

    try {
      await createBranch.mutateAsync({
        branch_name: branchName.trim(),
        display_name: branchName.trim(),
        city: city.trim() || undefined,
        is_primary: (branchesQuery.data?.length ?? 0) === 0,
      });
      setBranchName('');
      setCity('');
      setShowForm(false);
      snackbar.push('Branch created successfully.', 'success');
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : 'Unable to create branch.', 'error');
    }
  }

  async function handleSetPrimary(branchId: string) {
    try {
      await updateBranch.mutateAsync({ branchId, branch: { is_primary: true } });
      snackbar.push('Primary branch updated.', 'success');
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : 'Unable to update branch.', 'error');
    }
  }

  return (
    <Card style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: 12 }}>
            Locations
          </p>
          <h2 style={{ margin: '8px 0 0', fontSize: 20 }}>Branches</h2>
          <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
            Manage physical locations for the active business. The primary branch is used as the default workspace location.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowForm((current) => !current)}>
          {showForm ? 'Cancel' : 'Add branch'}
        </Button>
      </div>

      {showForm ? (
        <div style={{ marginTop: 20, padding: 16, borderRadius: 14, border: '1px solid #dbeafe', background: '#f8fbff', display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ color: '#6b7280', fontSize: 13 }}>Branch name</span>
              <input
                value={branchName}
                onChange={(event) => setBranchName(event.target.value)}
                placeholder="Downtown clinic"
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ color: '#6b7280', fontSize: 13 }}>City</span>
              <input
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Mumbai"
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}
              />
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" onClick={handleCreate} disabled={createBranch.isPending}>
              {createBranch.isPending ? 'Creating…' : 'Create branch'}
            </Button>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
        {branchesQuery.isLoading ? <p>Loading branches…</p> : null}
        {branchesQuery.error ? <p style={{ color: '#dc2626' }}>{branchesQuery.error.message}</p> : null}
        {!branchesQuery.isLoading && !branchesQuery.error && (branchesQuery.data?.length ?? 0) === 0 ? (
          <p style={{ color: '#6b7280' }}>No branches yet. Add your first location to get started.</p>
        ) : null}
        {(branchesQuery.data ?? []).map((branch) => (
          <div
            key={branch.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
              padding: 14,
              borderRadius: 12,
              border: branch.is_primary ? '1px solid #1a56db' : '1px solid #e5e7eb',
              background: branch.is_primary ? '#eef2ff' : '#fff',
            }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: '#eff6ff', color: '#1d4ed8' }}>
                <MapPin size={18} />
              </div>
              <div>
                <strong>{branch.display_name ?? branch.branch_name}</strong>
                <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
                  {branch.branch_code}
                  {branch.city ? ` · ${branch.city}` : ''}
                  {branch.is_primary ? ' · Primary' : ''}
                </p>
              </div>
            </div>
            {!branch.is_primary ? (
              <Button variant="ghost" onClick={() => handleSetPrimary(branch.id)} disabled={updateBranch.isPending}>
                Set as primary
              </Button>
            ) : (
              <span style={{ color: '#1a56db', fontWeight: 600, fontSize: 13 }}>Primary</span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
